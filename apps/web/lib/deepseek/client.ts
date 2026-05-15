import { getServerEnv } from "@/lib/env";
import type { InsightVerdict } from "@canteen/shared/insight";

export type DeepseekStreamChunk =
  | { type: "delta"; text: string }
  | { type: "verdict"; verdict: InsightVerdict };

interface RunOpts {
  system: string;
  user: string;
  temperature?: number;
}

/**
 * Yields incremental text chunks from DeepSeek's streaming chat completion API.
 * After the stream finishes, attempts to extract a trailing ```json {...} ```
 * block as the structured verdict.
 */
export async function* runDeepseekAnalysis(
  opts: RunOpts,
): AsyncGenerator<DeepseekStreamChunk, void, void> {
  const env = getServerEnv();
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY not configured");
  }

  const res = await fetch(`${env.DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL,
      stream: true,
      temperature: opts.temperature ?? 0.4,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`DeepSeek API ${res.status}: ${t.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let collected = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        const verdict = extractVerdict(collected);
        if (verdict) yield { type: "verdict", verdict };
        return;
      }
      // Parse SSE delta JSON; ignore malformed.
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = (parsed as {
        choices?: { delta?: { content?: string } }[];
      })?.choices?.[0]?.delta?.content;
      if (delta) {
        collected += delta;
        yield { type: "delta", text: delta };
      }
    }
  }

  const verdict = extractVerdict(collected);
  if (verdict) yield { type: "verdict", verdict };
}

function extractVerdict(text: string): InsightVerdict | undefined {
  const match = text.match(/```json\s*([\s\S]+?)```/i);
  if (!match) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const o = parsed as Record<string, unknown>;
  const yes = num(o.yes_prob ?? o.yesProb);
  const conf = num(o.confidence);
  const side = String(o.suggested_side ?? o.suggestedSide ?? "").toUpperCase();
  const size = num(o.suggested_size_usd ?? o.suggestedSizeUsd ?? 0);
  if (yes === undefined || conf === undefined) return undefined;
  return {
    yesProb: clamp01(yes),
    confidence: clamp01(conf),
    suggestedSide: side === "YES" || side === "NO" ? side : "SKIP",
    suggestedSizeUsd: Math.max(0, size ?? 0),
    reasoning:
      typeof o.reasoning === "string" ? o.reasoning : "(no reasoning)",
  };
}

function num(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  return undefined;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
