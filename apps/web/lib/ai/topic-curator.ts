import type { MarketSummary } from "@canteen/shared/insight";
import { fetchHotMarkets } from "@/lib/polymarket/gamma";
import { getKv, KV_KEYS } from "@/lib/kv";
import { getServerEnv } from "@/lib/env";

/**
 * Topic curator: pull hot markets from Polymarket Gamma, score each one with
 * a hybrid (volume + AI) signal, then pin the top N as "AI Picked" picks.
 *
 * Scoring formula:
 *
 *     finalScore = 0.7 * volumeScore + 0.3 * aiScore
 *
 *   - volumeScore (0–100): log10(volume24h) normalized; deterministic, always
 *     available.
 *   - aiScore    (0–100): DeepSeek rates each candidate on three axes
 *     (topicality / contention / researchability) and we average them. If
 *     DeepSeek is unavailable or errors, this collapses to 50 (neutral) so
 *     the volume signal alone decides ranking.
 *
 * Caching: full result (picks + all) is cached in KV for HOT_TTL seconds.
 * Set to 1 hour — AI rankings rarely shift within an hour, and this keeps
 * the DeepSeek bill negligible (~24 calls/day across all visitors).
 */

const HOT_TTL = 60 * 60; // 1 hour
const AI_CANDIDATE_COUNT = 30; // DeepSeek scores at most this many markets
const PICK_COUNT = 5;

export async function getCuratedMarkets(): Promise<{
  picks: MarketSummary[];
  all: MarketSummary[];
  cached: boolean;
}> {
  const kv = getKv();
  const cachedRaw = await kv.get<string>(KV_KEYS.marketsHot());
  if (cachedRaw) {
    try {
      const parsed = JSON.parse(cachedRaw) as {
        picks: MarketSummary[];
        all: MarketSummary[];
      };
      return { ...parsed, cached: true };
    } catch {
      // fall through and refresh
    }
  }

  const all = await fetchHotMarkets(36);

  // Score the top AI_CANDIDATE_COUNT (already volume-sorted from Gamma).
  const candidates = [...all].slice(0, AI_CANDIDATE_COUNT);
  const aiScores = await scoreWithAi(candidates).catch((e) => {
    // Defensive: any AI failure → neutral 50 for everyone, volume decides.
    console.warn(`[curator] AI scoring failed, falling back: ${(e as Error).message}`);
    return new Map<string, number>();
  });

  const picks = pickTopByHybridScore(candidates, aiScores, PICK_COUNT);

  await kv.set(
    KV_KEYS.marketsHot(),
    JSON.stringify({ picks, all }),
    { ex: HOT_TTL },
  );
  return { picks, all, cached: false };
}

/** Map markets → final hotness using volume + AI score. */
function pickTopByHybridScore(
  markets: MarketSummary[],
  aiScores: Map<string, number>,
  count: number,
): MarketSummary[] {
  // Volume score: log10 normalized to 0..100. Highest volume in the candidate
  // set maps to 100; bottom-tier markets land near 30–50.
  const maxLog = Math.max(
    1,
    ...markets.map((m) => Math.log10(Math.max(1, m.volume24h))),
  );

  const scored = markets.map((m) => {
    const vScore = (Math.log10(Math.max(1, m.volume24h)) / maxLog) * 100;
    const aScore = aiScores.get(m.id) ?? 50; // neutral fallback
    const hotness = Math.round(0.7 * vScore + 0.3 * aScore);
    return {
      ...m,
      hotness: Math.min(99, Math.max(0, hotness)),
      aiTag: hotnessToTag(hotness, m, aiScores.has(m.id)),
    };
  });

  return scored.sort((a, b) => (b.hotness ?? 0) - (a.hotness ?? 0)).slice(0, count);
}

function hotnessToTag(hotness: number, m: MarketSummary, hasAi: boolean): string {
  if (hotness > 90) return hasAi ? "AI Hot Pick" : "Whale magnet";
  if (Math.abs(m.yesProb - 0.5) < 0.06) return "Coin flip";
  if (m.yesProb > 0.7) return "Heavy YES bias";
  if (m.yesProb < 0.3) return "Heavy NO bias";
  return hasAi ? "AI Pick" : "Volume Pick";
}

// ────────────────────────────────────────────────────────────────────────────
// DeepSeek scoring
// ────────────────────────────────────────────────────────────────────────────

interface AiScoreEntry {
  id: string;
  topicality: number;     // 0–100, how broadly newsworthy this is
  contention: number;     // 0–100, how unresolved the market thinks it is
  researchability: number; // 0–100, how much TikHub-style evidence likely exists
}

const SYSTEM_PROMPT = `You are a market curator for a prediction-market research dApp. Given a JSON list of Polymarket markets, you score each one on three axes (0-100 each):
- topicality: how broadly newsworthy / trending this question is right now
- contention: how unresolved/uncertain it appears (50% probability = highest)
- researchability: how likely a multi-source intelligence aggregator (TikTok / X / YouTube / news) would surface useful evidence

Respond ONLY with a JSON array. No prose, no markdown, no explanation. Each entry MUST be:
{"id": "<market id>", "topicality": <int>, "contention": <int>, "researchability": <int>}

Output exactly one entry per input market, in the same order.`;

async function scoreWithAi(
  markets: MarketSummary[],
): Promise<Map<string, number>> {
  const env = getServerEnv();
  const result = new Map<string, number>();
  if (!env.DEEPSEEK_API_KEY || markets.length === 0) return result;

  const userPayload = markets.map((m) => ({
    id: m.id,
    question: m.question.slice(0, 160),
    yesProb: Number(m.yesProb.toFixed(2)),
    volume24h: Math.round(m.volume24h),
    category: m.category ?? "General",
  }));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);

  let parsed: AiScoreEntry[] = [];
  try {
    const res = await fetch(`${env.DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL,
        stream: false,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ markets: userPayload }) },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`DeepSeek ${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "[]";
    parsed = parseScoreArray(content);
  } finally {
    clearTimeout(timer);
  }

  for (const entry of parsed) {
    if (!entry?.id) continue;
    const t = clamp(0, 100, Number(entry.topicality));
    const c = clamp(0, 100, Number(entry.contention));
    const r = clamp(0, 100, Number(entry.researchability));
    if (Number.isFinite(t + c + r)) {
      result.set(String(entry.id), Math.round((t + c + r) / 3));
    }
  }
  return result;
}

/**
 * DeepSeek with `response_format: json_object` returns ONE top-level JSON
 * object. The model usually wraps the array under a key like `markets` or
 * `scores`. We try both shapes plus raw-array fallback.
 */
function parseScoreArray(content: string): AiScoreEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return [];
  }
  if (Array.isArray(raw)) return raw as AiScoreEntry[];
  if (raw && typeof raw === "object") {
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v as AiScoreEntry[];
    }
  }
  return [];
}

function clamp(lo: number, hi: number, n: number): number {
  if (!Number.isFinite(n)) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, n));
}
