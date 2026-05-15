/**
 * Polymarket trade integration. Lives entirely client-side because the user's
 * wallet must sign the order (EIP-712) on Polygon.
 *
 * For the demo we deliberately do NOT bundle @polymarket/clob-client by default
 * — it has heavyweight transitive deps and adds significant install time. The
 * `tryClobDynamic()` helper attempts a dynamic import at runtime; if it fails
 * (package not installed, network error, etc) we transparently fall back to a
 * deep-link to polymarket.com which is also a valid demo path.
 *
 * To enable real CLOB signing:
 *   pnpm -w add @polymarket/clob-client --filter @canteen/web
 *   then implement the placeholder bodies in placeOrderViaClob below.
 */

import type { MarketSummary } from "@canteen/shared/insight";

export type TradeSide = "YES" | "NO";

export interface PlaceOrderInput {
  market: MarketSummary;
  side: TradeSide;
  sizeUsd: number;
  signer: `0x${string}`;
}

export interface PlaceOrderResult {
  ok: boolean;
  txOrOrderId?: string;
  fallback?: "deep_link";
  url?: string;
  error?: string;
}

export function buildPolymarketDeepLink(market: MarketSummary, side: TradeSide): string {
  const slug = market.slug ?? market.id;
  // Polymarket honors `?outcome=Yes|No` as a hint, but it isn't authoritative.
  return `https://polymarket.com/event/${encodeURIComponent(slug)}?outcome=${side === "YES" ? "Yes" : "No"}`;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // Try clob-client. Wrapped in try/catch so the demo never crashes here.
  try {
    const clob = await tryClobDynamic();
    if (clob) {
      // Real call would look like:
      //   const order = await clob.createOrder({...})
      //   const tx = await clob.postOrder(order)
      // Until we are ready to put real money into a Polygon wallet, we treat
      // the dynamic import as a flag and still return a deep-link result, but
      // without the "fallback" tag — i.e. "we *could* sign onchain, but the
      // demo opens the official UI for transparency".
      void clob;
      const url = buildPolymarketDeepLink(input.market, input.side);
      return { ok: true, fallback: "deep_link", url };
    }
  } catch (e) {
    console.warn("[clob] dynamic import failed", e);
  }

  // Fallback: deep link.
  const url = buildPolymarketDeepLink(input.market, input.side);
  return { ok: true, fallback: "deep_link", url };
}

async function tryClobDynamic(): Promise<unknown | null> {
  try {
    // The `@polymarket/clob-client` package is intentionally NOT in dependencies.
    // Use a string variable so bundlers don't statically resolve the import.
    const pkg = "@polymarket/clob-client";
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const imp = new Function("p", "return import(p)") as (
      p: string,
    ) => Promise<unknown>;
    return await imp(pkg);
  } catch {
    return null;
  }
}
