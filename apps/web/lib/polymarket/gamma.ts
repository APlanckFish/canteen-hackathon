import type { MarketSummary } from "@canteen/shared/insight";
import { getServerEnv } from "@/lib/env";

/**
 * Polymarket Gamma API — public, no auth required.
 *  GET /markets?active=true&closed=false&order=volume&limit=50
 *
 * We only consume the fields we need; the rest of the response is treated as
 * loosely-typed JSON to insulate us from upstream schema drift.
 */

interface GammaMarketRaw {
  id: string;
  slug: string;
  question?: string;
  description?: string;
  image?: string;
  icon?: string;
  category?: string;
  endDate?: string;
  end_date?: string;
  volume24hr?: number;
  volume_24hr?: number;
  liquidity?: number;
  outcomes?: string;          // JSON-encoded array
  outcomePrices?: string;     // JSON-encoded array
  active?: boolean;
  closed?: boolean;
}

export async function fetchHotMarkets(limit = 24): Promise<MarketSummary[]> {
  const env = getServerEnv();
  const url = `${env.GAMMA_BASE_URL}/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=${limit}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    console.warn(`[gamma] ${res.status} on hot-markets`);
    return [];
  }
  const data = (await res.json()) as GammaMarketRaw[] | { data?: GammaMarketRaw[] };
  const list = Array.isArray(data) ? data : (data.data ?? []);
  return list.map(normalizeMarket).filter((m): m is MarketSummary => !!m);
}

export async function fetchMarketById(id: string): Promise<MarketSummary | null> {
  const env = getServerEnv();
  // Gamma supports either id or slug — try both.
  const tryUrls = [
    `${env.GAMMA_BASE_URL}/markets/${encodeURIComponent(id)}`,
    `${env.GAMMA_BASE_URL}/markets?slug=${encodeURIComponent(id)}`,
  ];
  for (const url of tryUrls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as GammaMarketRaw | GammaMarketRaw[];
      const raw = Array.isArray(data) ? data[0] : data;
      if (!raw) continue;
      const m = normalizeMarket(raw);
      if (m) return m;
    } catch {
      // try next url
    }
  }
  return null;
}

function normalizeMarket(raw: GammaMarketRaw): MarketSummary | null {
  if (!raw?.id) return null;
  const yesProb = parseYesPrice(raw.outcomes, raw.outcomePrices);
  const question = String(raw.question ?? raw.slug ?? "Untitled market");
  return {
    id: String(raw.id),
    slug: String(raw.slug ?? raw.id),
    question,
    description: raw.description,
    imageUrl: raw.image ?? raw.icon,
    yesProb,
    volume24h: raw.volume24hr ?? raw.volume_24hr ?? 0,
    liquidity: raw.liquidity ?? 0,
    endDate: raw.endDate ?? raw.end_date,
    // Gamma's /markets endpoint does NOT return `category`; infer it from
    // the question text so client-side filters (Politics / Crypto / etc.) work.
    category: raw.category ?? inferCategory(question, raw.description),
  };
}

/**
 * Lightweight rule-based categorizer. Maps the question + description to one
 * of the canonical UI buckets (Politics / Crypto / Sports / Entertainment),
 * falling back to "General" when nothing matches.
 */
function inferCategory(question: string, description?: string): string {
  const text = `${question} ${description ?? ""}`.toLowerCase();

  const politics =
    /\b(election|president|senate|congress|gop|democrat|republican|vote|impeach|prime minister|government|trump|biden|harris|putin|netanyahu|xi jinping|geopolit|war|nato|brexit|tariff|sanction|hormuz)\b/;
  const crypto =
    /\b(bitcoin|btc|ethereum|eth|solana|sol|doge|crypto|stablecoin|usdc|usdt|defi|nft|altcoin|memecoin|airdrop|token|halving|sec\s+approve)\b/;
  const sports =
    /\b(nba|nfl|mlb|nhl|fifa|premier league|champions league|world cup|olympic|f1|formula 1|ufc|boxing|tennis|golf|playoff|finals?|super bowl|messi|ronaldo|lebron)\b/;
  const entertainment =
    /\b(oscar|grammy|emmy|movie|film|box office|netflix|disney|taylor swift|kardashian|tv show|album|billboard|celebrity|hollywood|gaming|video game)\b/;

  if (politics.test(text)) return "Politics";
  if (crypto.test(text)) return "Crypto";
  if (sports.test(text)) return "Sports";
  if (entertainment.test(text)) return "Entertainment";
  return "General";
}

function parseYesPrice(outcomes?: string, prices?: string): number {
  try {
    const oc = outcomes ? (JSON.parse(outcomes) as string[]) : ["Yes", "No"];
    const px = prices ? (JSON.parse(prices) as string[]) : ["0.5", "0.5"];
    const idx = oc.findIndex((o) => /yes/i.test(o));
    const v = idx >= 0 ? parseFloat(px[idx] ?? "0.5") : parseFloat(px[0] ?? "0.5");
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  } catch {
    return 0.5;
  }
}
