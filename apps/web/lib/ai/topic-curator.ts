import type { MarketSummary } from "@canteen/shared/insight";
import { fetchHotMarkets } from "@/lib/polymarket/gamma";
import { getKv, KV_KEYS } from "@/lib/kv";

/**
 * Topic curator: pull hot markets, pin a few "AI Picked" picks based on simple
 * heuristics. Heavy DeepSeek-driven scoring can be added later — for the demo
 * we mix raw volume with a category boost and produce deterministic hotness.
 */

const HOT_TTL = 60; // seconds

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
  const picks = pickAiFavorites(all, 5);
  await kv.set(
    KV_KEYS.marketsHot(),
    JSON.stringify({ picks, all }),
    { ex: HOT_TTL },
  );
  return { picks, all, cached: false };
}

function pickAiFavorites(markets: MarketSummary[], count: number): MarketSummary[] {
  const sorted = [...markets].sort((a, b) => b.volume24h - a.volume24h);
  const picks = sorted.slice(0, count).map((m) => {
    const hotness = Math.min(99, 50 + Math.log10(Math.max(1, m.volume24h)) * 10);
    return {
      ...m,
      hotness: Math.round(hotness),
      aiTag: hotnessToTag(hotness, m),
    };
  });
  return picks;
}

function hotnessToTag(hotness: number, m: MarketSummary): string {
  if (hotness > 90) return "Whale magnet";
  if (Math.abs(m.yesProb - 0.5) < 0.06) return "Coin flip";
  if (m.yesProb > 0.7) return "Heavy YES bias";
  if (m.yesProb < 0.3) return "Heavy NO bias";
  return "AI Pick";
}
