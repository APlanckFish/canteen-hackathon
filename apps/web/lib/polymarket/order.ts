/**
 * Polymarket order construction & signing.
 *
 * Implementation goal:
 *   - Stay native to viem/wagmi v2 — DON'T bundle @polymarket/clob-client
 *     (it ships ethers v5 + a heavy dep tree that conflicts with our stack).
 *   - Build the order struct, EIP-712 sign with the user's wallet, then send
 *     through our own `/api/trade/place` proxy (Vercel HKG) to dodge
 *     Polymarket's geo-restricted CLOB API.
 *
 * Reference for the exact serialization Polymarket expects:
 *   https://github.com/Polymarket/clob-client/blob/main/src/utilities.ts
 *   https://github.com/Polymarket/exchange-orderbook
 */

import type { WalletClient } from "viem";
import { parseUnits } from "viem";
import {
  buildOrderDomain,
  OrderSide,
  ORDER_EXPIRATION_GTC,
  ORDER_FEE_RATE_BPS,
  ORDER_TYPES,
  SignatureType,
} from "./constants";

export type TradeSide = "YES" | "NO";

/**
 * Whole-number-of-decimals representation of an order, exactly as sent
 * to /order. All amounts in 6-decimals (USDC base units). Matches the
 * fields expected by Polymarket's REST endpoint.
 */
export interface SignedClobOrder {
  /** Hex 0x...: keccak256(order) — server recomputes & verifies. */
  salt: string;
  maker: `0x${string}`;
  signer: `0x${string}`;
  taker: `0x${string}`;
  tokenId: string;       // ERC1155 outcome id (huge decimal string)
  makerAmount: string;   // base units (6 decimals)
  takerAmount: string;   // base units (6 decimals)
  expiration: string;    // unix seconds; "0" = GTC
  nonce: string;
  feeRateBps: string;
  side: string;          // "0" = BUY, "1" = SELL
  signatureType: number; // 0 = EOA
  signature: `0x${string}`;
}

export interface BuildOrderInput {
  walletClient: WalletClient;
  /** EOA address that signs. */
  owner: `0x${string}`;
  /** Outcome token id (from MarketSummary.clobTokenIds). */
  tokenId: string;
  /** "YES" buys yes-token; "NO" buys no-token. */
  side: TradeSide;
  /** Limit price in USDC per share, e.g. 0.62 for 62¢. Range: (0, 1). */
  price: number;
  /** Spend amount in USDC (e.g. 0.01). The system computes shares = sizeUsd / price. */
  sizeUsd: number;
  /** True if the market is a NegRisk multi-outcome market. */
  negRisk: boolean;
}

/**
 * Build & sign a BUY order. We don't expose SELL here — the demo always opens
 * a fresh long position. Selling existing shares can be added by flipping the
 * `side` field, but that requires an existing balance check we don't do yet.
 */
export async function buildAndSignBuyOrder(
  input: BuildOrderInput,
): Promise<SignedClobOrder> {
  const { walletClient, owner, tokenId, price, sizeUsd, negRisk } = input;

  if (!(price > 0 && price < 1)) {
    throw new Error(`price out of range (0,1): ${price}`);
  }
  if (!(sizeUsd > 0)) {
    throw new Error(`sizeUsd must be > 0: ${sizeUsd}`);
  }

  // ── compute amounts ────────────────────────────────────────────────────────
  // Polymarket convention for BUY:
  //   maker (us) pays USDC = sizeUsd
  //   maker (us) receives YES/NO shares = sizeUsd / price
  // Both serialized as 6-decimal base units (matches USDC and CTF token).
  const makerAmount = parseUnits(sizeUsd.toFixed(6), 6); // USDC paid out
  const shareCount = sizeUsd / price; // raw shares (still float)
  const takerAmount = parseUnits(shareCount.toFixed(6), 6); // shares received

  // Random salt + nonce → ensures unique order hash even for identical params.
  const saltBig = randomU256();
  const nonceBig = randomU256();

  const orderStruct = {
    salt: saltBig,
    maker: owner,
    signer: owner,
    taker: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    tokenId: BigInt(tokenId),
    makerAmount: makerAmount,
    takerAmount: takerAmount,
    expiration: ORDER_EXPIRATION_GTC,
    nonce: nonceBig,
    feeRateBps: ORDER_FEE_RATE_BPS,
    // viem maps EIP-712 uint8 → TS number, not bigint.
    side: OrderSide.BUY as number, // BUY for both YES and NO (we're acquiring shares)
    signatureType: SignatureType.EOA as number,
  };

  const domain = buildOrderDomain(negRisk);

  // viem's wallet signTypedData uses the connected account (OKX / MetaMask)
  // to sign the EIP-712 hash. This pops the wallet confirm dialog.
  const signature = await walletClient.signTypedData({
    account: owner,
    domain,
    types: ORDER_TYPES,
    primaryType: "Order",
    message: orderStruct,
  });

  // Convert to wire format (decimal strings — Polymarket REST expects strings).
  return {
    salt: "0x" + saltBig.toString(16),
    maker: orderStruct.maker,
    signer: orderStruct.signer,
    taker: orderStruct.taker,
    tokenId: orderStruct.tokenId.toString(),
    makerAmount: orderStruct.makerAmount.toString(),
    takerAmount: orderStruct.takerAmount.toString(),
    expiration: orderStruct.expiration.toString(),
    nonce: orderStruct.nonce.toString(),
    feeRateBps: orderStruct.feeRateBps.toString(),
    side: orderStruct.side.toString(),
    signatureType: SignatureType.EOA,
    signature,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** Cryptographically random 256-bit unsigned int as bigint. */
function randomU256(): bigint {
  // 32 random bytes → bigint
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Should never happen in browser; throw so we don't silently use weak rng.
    throw new Error("crypto.getRandomValues unavailable");
  }
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex);
}
