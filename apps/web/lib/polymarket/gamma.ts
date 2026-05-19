import type { MarketSummary } from "@canteen/shared/insight";
import { getServerEnv } from "@/lib/env";

/**
 * Polymarket Gamma API — public, no auth required.
 *
 * Two endpoints we use:
 *   - GET /markets       individual markets (single YES/NO pair)
 *   - GET /events        the "cards" users see on polymarket.com — each event
 *                        bundles 1..N markets and carries the canonical
 *                        title / image / tags. Supports `tag_slug` filter.
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
  /** JSON-encoded array of two CLOB ERC1155 token ids: [yesId, noId]. */
  clobTokenIds?: string;
  /** Decimal string e.g. "0.01" */
  orderPriceMinTickSize?: number | string;
  /** Decimal string e.g. "5" (USDC) */
  orderMinSize?: number | string;
  negRisk?: boolean;
}

/** Gamma /events shape — we only read a tiny subset. */
interface GammaEventRaw {
  id: string;
  slug?: string;
  ticker?: string;
  title?: string;
  description?: string;
  image?: string;
  icon?: string;
  endDate?: string;
  volume24hr?: number;
  liquidity?: number;
  active?: boolean;
  closed?: boolean;
  tags?: { id?: string; slug?: string; label?: string }[];
  /** Nested markets — usually 1, but multi-outcome events can have many. */
  markets?: GammaMarketRaw[];
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

/**
 * Fetch events filtered by Polymarket's canonical tag slug (the same slug
 * used in URLs like polymarket.com/crypto, /sports, /pop-culture, …).
 * Each event is flattened into a MarketSummary using its highest-volume
 * inner market as the representative.
 *
 * Pass `slug = undefined` to skip filtering — useful for the "All" tab.
 */
export async function fetchEventsByTag(opts: {
  slug?: string;
  offset?: number;
  limit?: number;
}): Promise<MarketSummary[]> {
  const env = getServerEnv();
  const params = new URLSearchParams({
    active: "true",
    closed: "false",
    archived: "false",
    order: "volume24hr",
    ascending: "false",
    limit: String(opts.limit ?? 20),
    offset: String(opts.offset ?? 0),
  });
  if (opts.slug) params.set("tag_slug", opts.slug);

  const url = `${env.GAMMA_BASE_URL}/events?${params.toString()}`;
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
    console.warn(`[gamma] ${res.status} on /events?${params.toString()}`);
    return [];
  }
  const data = (await res.json()) as
    | GammaEventRaw[]
    | { data?: GammaEventRaw[] };
  const list = Array.isArray(data) ? data : (data.data ?? []);
  return list
    .map((ev) => eventToMarketSummary(ev, opts.slug))
    .filter((m): m is MarketSummary => !!m);
}

/**
 * Convert a Gamma event into our MarketSummary shape.
 *
 *  - Binary events (1 inner market) → return that market verbatim.
 *  - Multi-outcome events (negRisk, many inner markets) → build an
 *    `outcomes` array of the top-K active candidates ranked by YES price.
 *    The "representative" market (highest YES) carries `clobTokenIds` so
 *    the user can still place a trade on the leader directly.
 */
function eventToMarketSummary(
  ev: GammaEventRaw,
  tagSlug?: string,
): MarketSummary | null {
  if (!ev?.id) return null;
  const innerMarkets = (ev.markets ?? []).filter(
    (m) => m && m.active !== false && m.closed !== true,
  );
  if (innerMarkets.length === 0) return null;

  // Sort active inner markets by YES probability (highest first).
  const enriched = innerMarkets
    .map((m) => ({
      raw: m,
      summary: normalizeMarket(m),
    }))
    .filter((x): x is { raw: GammaMarketRaw; summary: MarketSummary } =>
      !!x.summary,
    )
    .sort((a, b) => b.summary.yesProb - a.summary.yesProb);
  if (enriched.length === 0) return null;

  const rep = enriched[0]!.summary;
  const category = pickCategoryFromTags(ev.tags) ?? tagSlug ?? rep.category;
  const question = ev.title ?? ev.ticker ?? rep.question;

  // Multi-outcome → expose top-K candidates with everything the trade
  // dialog needs to place a real order on each one individually.
  const isMulti = enriched.length > 1;
  const outcomes = isMulti
    ? enriched.slice(0, 12).map((x) => ({
        id: x.summary.id,
        label: candidateLabel(x.raw.question ?? "", question),
        question: String(x.raw.question ?? x.summary.question),
        prob: x.summary.yesProb,
        clobTokenIds: x.summary.clobTokenIds,
        tickSize: x.summary.tickSize,
        minOrderSize: x.summary.minOrderSize,
        negRisk: x.summary.negRisk,
      }))
    : undefined;

  return {
    ...rep,
    id: String(ev.id),
    slug: ev.slug ?? ev.ticker ?? rep.slug,
    question,
    description: ev.description ?? rep.description,
    imageUrl: ev.image ?? ev.icon ?? rep.imageUrl,
    endDate: ev.endDate ?? rep.endDate,
    // Event-level volume is the sum across inner markets — more useful
    // for sorting / displaying "card-level" liquidity.
    volume24h: ev.volume24hr ?? rep.volume24h,
    liquidity: ev.liquidity ?? rep.liquidity,
    category,
    outcomes,
  };
}

/**
 * Extract a clean candidate label from a market question. Polymarket's
 * multi-outcome events use questions like:
 *   "Will the Colorado Avalanche win the 2026 NHL Stanley Cup?"
 * The event title is e.g. "2026 NHL Stanley Cup Champion". We strip the
 * boilerplate so the UI just shows "Colorado Avalanche".
 */
function candidateLabel(rawQuestion: string, eventTitle: string): string {
  let label = rawQuestion;
  // Strip leading "Will the / Will " and trailing "?".
  label = label.replace(/^will\s+(the\s+)?/i, "").replace(/\?$/, "");
  // Strip "win the <event title>" / "win <event title>" / "<event title>".
  const escaped = eventTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  label = label.replace(new RegExp(`\\s*win(\\s+the)?\\s+${escaped}\\s*$`, "i"), "");
  label = label.replace(new RegExp(`\\s*${escaped}\\s*$`, "i"), "");
  return label.trim() || rawQuestion;
}

function pickCategoryFromTags(
  tags?: { slug?: string; label?: string }[],
): string | undefined {
  if (!tags?.length) return undefined;
  // Use the first tag with a label, capitalized.
  const t = tags.find((x) => x.label);
  if (!t?.label) return undefined;
  // Title-case the label, leaving acronyms alone.
  return t.label
    .split(/\s+/)
    .map((w) => (w.length > 3 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export async function fetchMarketById(id: string): Promise<MarketSummary | null> {
  const env = getServerEnv();
  // We now feed card `id`s from the /events endpoint, so try that first.
  // Fall back to /markets for any direct-link / legacy ids that still
  // reference a market id rather than an event id.
  const eventUrls = [
    `${env.GAMMA_BASE_URL}/events/${encodeURIComponent(id)}`,
    `${env.GAMMA_BASE_URL}/events?slug=${encodeURIComponent(id)}`,
  ];
  for (const url of eventUrls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as GammaEventRaw | GammaEventRaw[];
      const raw = Array.isArray(data) ? data[0] : data;
      if (!raw) continue;
      const m = eventToMarketSummary(raw);
      if (m) return m;
    } catch {
      // try next url
    }
  }

  const marketUrls = [
    `${env.GAMMA_BASE_URL}/markets/${encodeURIComponent(id)}`,
    `${env.GAMMA_BASE_URL}/markets?slug=${encodeURIComponent(id)}`,
  ];
  for (const url of marketUrls) {
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
  const clobTokenIds = parseClobTokenIds(raw.outcomes, raw.clobTokenIds);
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
    clobTokenIds,
    tickSize: parseNum(raw.orderPriceMinTickSize, 0.01),
    minOrderSize: parseNum(raw.orderMinSize, 5),
    negRisk: raw.negRisk === true,
  };
}

/**
 * Parse Gamma's `clobTokenIds` (JSON-encoded array of two huge decimal strings)
 * into a YES/NO map, using `outcomes` to determine which slot is YES.
 */
function parseClobTokenIds(
  outcomes?: string,
  clobTokenIds?: string,
): { yes: string; no: string } | undefined {
  if (!clobTokenIds) return undefined;
  try {
    const ids = JSON.parse(clobTokenIds) as string[];
    if (!Array.isArray(ids) || ids.length < 2) return undefined;
    const oc = outcomes ? (JSON.parse(outcomes) as string[]) : ["Yes", "No"];
    const yesIdx = oc.findIndex((o) => /yes/i.test(o));
    const yes = ids[yesIdx >= 0 ? yesIdx : 0];
    const no = ids[yesIdx >= 0 ? 1 - yesIdx : 1];
    if (!yes || !no) return undefined;
    return { yes: String(yes), no: String(no) };
  } catch {
    return undefined;
  }
}

function parseNum(v: unknown, dflt: number): number {
  if (v === undefined || v === null || v === "") return dflt;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : dflt;
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
