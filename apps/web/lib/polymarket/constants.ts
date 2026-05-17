/**
 * Polymarket protocol constants — Polygon Mainnet.
 *
 * Sources:
 *   - https://docs.polymarket.com/developers/CLOB/introduction
 *   - https://github.com/Polymarket/exchange-orderbook
 *   - https://github.com/Polymarket/clob-client
 *
 * NEVER trust me on these — verify on Polygonscan if anything looks off.
 */

import { polygonMainnet } from "@/lib/chains";

/** Polygon Mainnet chain id for EIP-712 signing. */
export const POLYGON_CHAIN_ID = polygonMainnet.id; // 137

// ── Token addresses ──────────────────────────────────────────────────────────

/** Bridged USDC.e on Polygon — what Polymarket uses for collateral. */
export const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;

/** Conditional Tokens Framework (CTF) ERC1155 — outcome shares contract. */
export const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const;

// ── Exchange contracts ───────────────────────────────────────────────────────

/** Standard CTFExchange (binary YES/NO markets). */
export const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;

/** NegRisk CTF Exchange (multi-outcome markets). */
export const NEG_RISK_CTF_EXCHANGE =
  "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const;

/** NegRiskAdapter — required approval target for negRisk markets. */
export const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as const;

// ── CLOB API ─────────────────────────────────────────────────────────────────

/**
 * Public CLOB host. We DON'T call this directly from the browser — the request
 * is proxied through `/api/trade/place` (Vercel Edge HKG region) to bypass
 * Polymarket's geographic restrictions on user/server IPs in the US.
 */
export const CLOB_HOST = "https://clob.polymarket.com" as const;

// ── EIP-712 typed-data ───────────────────────────────────────────────────────

/**
 * Polymarket's CTFExchange Order EIP-712 domain.
 * Same `name`/`version` apply to both the standard and negRisk exchanges,
 * but `verifyingContract` differs.
 */
export function buildOrderDomain(negRisk: boolean) {
  return {
    name: "Polymarket CTF Exchange",
    version: "1",
    chainId: POLYGON_CHAIN_ID,
    verifyingContract: negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE,
  } as const;
}

/** Order struct ABI for EIP-712 signing. */
export const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
} as const;

// ── Order enums (must match on-chain CTFExchange contract) ───────────────────

/** Order side: BUY = 0, SELL = 1. */
export enum OrderSide {
  BUY = 0,
  SELL = 1,
}

/**
 * Signature type. EOA = direct ECDSA (the only path we support — OKX/MetaMask).
 * Polymarket also supports POLY_PROXY (1) and POLY_GNOSIS_SAFE (2) for
 * email-login users, but those need their proxy infra.
 */
export enum SignatureType {
  EOA = 0,
  POLY_PROXY = 1,
  POLY_GNOSIS_SAFE = 2,
}

/** Default expiration: 0 = good till canceled (GTC). */
export const ORDER_EXPIRATION_GTC = 0n;

/** Default fee rate: 0 bps. CLOB charges via market-side, not order-side. */
export const ORDER_FEE_RATE_BPS = 0n;
