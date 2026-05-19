/**
 * Polymarket Deposit Wallet (V2) lookup.
 *
 * V2 protocol forbids "stranger EOA" makers. Every order must be signed on
 * behalf of a wallet that's already known to Polymarket — for users who
 * registered via polymarket.com that's the **deposit wallet** (or in older
 * accounts: a Polymarket Proxy / Gnosis Safe).
 *
 * The deposit wallet is a smart-contract wallet that:
 *   - Holds the user's pUSD.
 *   - Is owned by the user's EOA (via EIP-1271).
 *   - Has its approvals to V2 Exchange / NegRiskAdapter pre-set by Polymarket.
 *
 * Polymarket does NOT expose a public API to map EOA → deposit wallet
 * directly. But the public `polymarket.com/profile/<eoa>` page renders a
 * Next.js RSC payload that embeds `"proxyWallet":"0x..."`. We extract that
 * via a server-side proxy (because polymarket.com geo-blocks our region).
 */

/** A user's V2 trading account. */
export interface PolymarketAccount {
  /** EOA the user signs with. */
  eoa: `0x${string}`;
  /** Deposit / proxy / safe wallet — what Polymarket calls "proxyWallet". */
  fundingWallet: `0x${string}`;
  /** Whether `fundingWallet` is a smart contract (vs. a plain EOA). */
  isContract: boolean;
}

/**
 * Look up `eoa`'s Polymarket-managed wallet via the public profile page.
 *
 * The page is HTML but contains the proxyWallet field as a literal JSON
 * snippet (`"proxyWallet":"0x..."`). We just regex it out — fragile but
 * works as long as Polymarket renders it this way. If the page format
 * changes, this helper will return null and the caller should fall back
 * to "manual EOA" mode.
 */
export async function lookupFundingWallet(
  eoa: `0x${string}`,
): Promise<`0x${string}` | null> {
  // Use our own proxy route to avoid US-IP blocks from the browser.
  const url = `/api/trade/polymarket-profile?address=${eoa}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const json = (await r.json()) as { fundingWallet?: string };
    if (
      json.fundingWallet &&
      /^0x[0-9a-fA-F]{40}$/.test(json.fundingWallet)
    ) {
      return json.fundingWallet.toLowerCase() as `0x${string}`;
    }
    return null;
  } catch {
    return null;
  }
}
