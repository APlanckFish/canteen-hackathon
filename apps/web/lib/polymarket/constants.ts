/**
 * Polymarket protocol constants — Polygon Mainnet (V2).
 *
 * Polymarket migrated to a new protocol on 2026-04-28:
 *   - SDK:     @polymarket/clob-client → @polymarket/clob-client-v2
 *   - Exchange: V1 (0x4bFb41d5...) → V2 (0xE111180000d2663...)
 *   - NegRisk:  V1 (0xC5d563A3...) → V2 (0xe2222d279d7440...)
 *   - Collateral: USDC.e → pUSD (Polymarket USD, 1:1 wrapped USDC.e)
 *   - Users wrap USDC.e → pUSD via CollateralOnramp.wrap(USDCE, recipient, amount)
 *
 * EOA signing (signatureType=0) is still supported in V2. Existing Safe/Proxy
 * users keep their old setup (sigTypes 0/1/2). Only "new API users" need
 * deposit wallets + POLY_1271 (sigType=3).
 *
 * Sources:
 *   - https://docs.polymarket.com/resources/contracts (V2 contract list)
 *   - https://github.com/Polymarket/clob-client-v2 (V2 SDK)
 *   - https://docs.polymarket.com/trading/deposit-wallets (sig type table)
 */

import { polygonMainnet } from "@/lib/chains";

/** Polygon Mainnet chain id for EIP-712 signing. */
export const POLYGON_CHAIN_ID = polygonMainnet.id; // 137

// ── Token addresses ──────────────────────────────────────────────────────────

/**
 * Bridged USDC.e on Polygon. Pre-V2 collateral; in V2 it must be WRAPPED into
 * pUSD via the CollateralOnramp before it can be used to back orders.
 */
export const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;

/**
 * pUSD ("Polymarket USD") — V2 native collateral. ERC20, 6 decimals,
 * 1:1 backed by USDC.e via the CollateralOnramp.
 */
export const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB" as const;

/**
 * CollateralOnramp — wraps USDC.e into pUSD (and presumably other ERC20s in
 * future). Function signature confirmed from on-chain tx data:
 *   wrap(address tokenIn, address recipient, uint256 amount)  [selector 0x62355638]
 * Caller must first approve(USDCE → Onramp, amount).
 */
export const COLLATERAL_ONRAMP =
  "0x93070a847efEf7F70739046A929D47a521F5B8ee" as const;

/** Conditional Tokens Framework (CTF) ERC1155 — outcome shares contract. */
export const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const;

// ── Exchange contracts ───────────────────────────────────────────────────────

/** V1 CTFExchange (binary YES/NO) — DEPRECATED post 2026-04-28. */
export const CTF_EXCHANGE_V1 = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;

/** V2 CTFExchange (binary YES/NO markets) — currently active. */
export const CTF_EXCHANGE = "0xE111180000d2663C0091e4f400237545B87B996B" as const;

/** V1 NegRisk CTF Exchange — DEPRECATED post 2026-04-28. */
export const NEG_RISK_CTF_EXCHANGE_V1 =
  "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const;

/** V2 NegRisk CTF Exchange (multi-outcome markets) — currently active. */
export const NEG_RISK_CTF_EXCHANGE =
  "0xe2222d279d744050d28E00520010520000310F59" as const;

/**
 * NegRiskAdapter — required approval target for NegRisk markets (extra
 * ERC20 + ERC1155 approvals on top of the normal Exchange ones).
 */
export const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as const;

// ── CLOB API ─────────────────────────────────────────────────────────────────

/**
 * Public CLOB host. We DON'T call this directly from the browser — the request
 * is proxied through `/api/trade/clob-proxy` (Vercel Edge HKG region) to
 * bypass Polymarket's geographic restrictions on user/server IPs in the US.
 */
export const CLOB_HOST = "https://clob.polymarket.com" as const;

// ── EIP-712 typed-data (legacy) ──────────────────────────────────────────────

/**
 * Legacy: pre-SDK EIP-712 helpers. We no longer build the typed data manually —
 * the V2 SDK handles signing internally — but kept here for diagnostic /
 * fallback purposes.
 */
export function buildOrderDomain(negRisk: boolean) {
  return {
    name: "Polymarket CTF Exchange",
    version: "1",
    chainId: POLYGON_CHAIN_ID,
    verifyingContract: negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE,
  } as const;
}

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

export enum OrderSide {
  BUY = 0,
  SELL = 1,
}

export enum SignatureType {
  EOA = 0,
  POLY_PROXY = 1,
  POLY_GNOSIS_SAFE = 2,
  POLY_1271 = 3, // V2 deposit wallet — not used by us (we sign with EOA)
}

export const ORDER_EXPIRATION_GTC = 0n;
export const ORDER_FEE_RATE_BPS = 0n;
