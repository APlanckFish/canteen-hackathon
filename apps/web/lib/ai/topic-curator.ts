import type { MarketSummary } from "@canteen/shared/insight";
import { fetchEventsByTag } from "@/lib/polymarket/gamma";
import { getKv, KV_KEYS } from "@/lib/kv";
import { getServerEnv } from "@/lib/env";

/**
 * Topic curator: two public entry points.
 *
 *   getAiPicks()          — returns the top-N AI-curated markets, blending
 *                            volume + DeepSeek scoring. Cached 1h in KV.
 *   getCategoryPage()     — returns one page of events filtered by Polymarket
 *                            tag (crypto / sports / politics / pop-culture).
 *                            Page 0 cached 60s; subsequent pages uncached.
 *
 * The legacy getCuratedMarkets() preserves backwards compatibility for the
 * RSC home page: it returns picks + a default "all" listing (no filter).
 */

const PICKS_TTL = 60 * 60; // 1 h — AI scoring is the expensive part
const CAT_PAGE0_TTL = 60;  // 60 s — first page warmup cache
const AI_CANDIDATE_COUNT = 30;
const PICK_COUNT = 5;
const PAGE_SIZE = 20;

// ────────────────────────────────────────────────────────────────────────────
// Public: AI picks (curated rail)
// ────────────────────────────────────────────────────────────────────────────

export async function getAiPicks(): Promise<MarketSummary[]> {
  const kv = getKv();
  const cached = await kv.get<string>(KV_KEYS.marketsHot());
  if (cached) {
    try {
      return JSON.parse(cached) as MarketSummary[];
    } catch {
      // fall through and refresh
    }
  }

  // AI picks use the SAME data source as the rest of the grid (events
  // endpoint) so the front-end can dedupe by event id cleanly. We pull a
  // larger candidate pool here to give DeepSeek more variety to score.
  const candidates = await fetchEventsByTag({ limit: AI_CANDIDATE_COUNT });
  const aiScores = await scoreWithAi(candidates).catch((e) => {
    console.warn(`[curator] AI scoring failed, falling back: ${(e as Error).message}`);
    return new Map<string, number>();
  });
  const picks = rankAndTag(candidates, aiScores, PICK_COUNT);

  await kv.set(KV_KEYS.marketsHot(), JSON.stringify(picks), {
    ex: PICKS_TTL,
  });
  return picks;
}

// ────────────────────────────────────────────────────────────────────────────
// Public: category page (paginated)
// ────────────────────────────────────────────────────────────────────────────

export async function getCategoryPage(opts: {
  /** Polymarket tag slug; undefined = "All" (no tag filter). */
  slug?: string;
  /** 0-indexed page number. */
  page?: number;
}): Promise<{ items: MarketSummary[]; nextPage: number | null }> {
  const page = opts.page ?? 0;
  const offset = page * PAGE_SIZE;

  // Cache only the first page (most users never scroll, so it's the hot path).
  const cacheable = page === 0;
  const kv = getKv();
  const cacheKey = KV_KEYS.marketsCat(opts.slug ?? "all", offset);

  if (cacheable) {
    const cached = await kv.get<string>(cacheKey);
    if (cached) {
      try {
        const items = JSON.parse(cached) as MarketSummary[];
        return {
          items,
          nextPage: items.length === PAGE_SIZE ? page + 1 : null,
        };
      } catch {
        // fall through and refresh
      }
    }
  }

  const items = await fetchEventsByTag({
    slug: opts.slug,
    offset,
    limit: PAGE_SIZE,
  });

  if (cacheable && items.length > 0) {
    await kv.set(cacheKey, JSON.stringify(items), { ex: CAT_PAGE0_TTL });
  }

  return {
    items,
    // If we got a full page back, assume there might be another.
    nextPage: items.length === PAGE_SIZE ? page + 1 : null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Public: combined (RSC initial payload for "All" tab)
// ────────────────────────────────────────────────────────────────────────────

export async function getCuratedMarkets(): Promise<{
  picks: MarketSummary[];
  all: MarketSummary[];
  cached: boolean;
}> {
  // Two trips, in parallel: AI picks (cached 1h) + first-page "All" feed.
  const [picks, firstPage] = await Promise.all([
    getAiPicks(),
    getCategoryPage({ page: 0 }),
  ]);
  return { picks, all: firstPage.items, cached: false };
}

// ────────────────────────────────────────────────────────────────────────────
// Internal: scoring + tagging
// ────────────────────────────────────────────────────────────────────────────

function rankAndTag(
  markets: MarketSummary[],
  aiScores: Map<string, number>,
  count: number,
): MarketSummary[] {
  const maxLog = Math.max(
    1,
    ...markets.map((m) => Math.log10(Math.max(1, m.volume24h))),
  );

  const scored = markets.map((m) => {
    const vScore = (Math.log10(Math.max(1, m.volume24h)) / maxLog) * 100;
    const aScore = aiScores.get(m.id) ?? 50;
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

interface AiScoreEntry {
  id: string;
  topicality: number;
  contention: number;
  researchability: number;
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
    if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
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
