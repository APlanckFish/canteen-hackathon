/**
 * Polymarket deep-link builder.
 *
 * Trading itself happens via the official @polymarket/clob-client SDK in
 * TradeDialog.tsx — we only keep this file for the secondary "Open on
 * polymarket.com" button (used as a fallback when a market lacks
 * clobTokenIds, or when the user prefers the official UI).
 */

import type { MarketSummary } from "@canteen/shared/insight";

export type TradeSide = "YES" | "NO";

export function buildPolymarketDeepLink(
  market: MarketSummary,
  side: TradeSide,
): string {
  const slug = market.slug ?? market.id;
  // We sourced this slug from the Gamma `/events` endpoint, so it's an
  // EVENT slug (e.g. "2026-nhl-stanley-cup-champion"). polymarket.com
  // serves event slugs at /event/<slug>; the /market/<slug> path is
  // reserved for inner-market slugs ("will-the-...") which 307 → 404
  // when fed an event slug.
  return `https://polymarket.com/event/${encodeURIComponent(slug)}?outcome=${
    side === "YES" ? "Yes" : "No"
  }`;
}
