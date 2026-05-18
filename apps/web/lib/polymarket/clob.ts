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
  // Polymarket honors `?outcome=Yes|No` as a hint, but isn't authoritative.
  return `https://polymarket.com/event/${encodeURIComponent(slug)}?outcome=${
    side === "YES" ? "Yes" : "No"
  }`;
}
