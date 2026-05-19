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
  // Use /market/<slug> rather than /event/<slug> — Polymarket 307s
  // /market URLs to the canonical /event/<eventSlug>/<marketSlug> path,
  // whereas /event/<marketSlug> directly returns 404 for many markets.
  return `https://polymarket.com/market/${encodeURIComponent(slug)}?outcome=${
    side === "YES" ? "Yes" : "No"
  }`;
}
