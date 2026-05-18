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
 * Reference: tested against Polymarket clob-client `orderToJson` and
 *   `buildOrder` (main branch). Two important format quirks:
 *   - `salt` MUST fit in JS Number (parseInt(salt, 10)) — server uses Number,
 *     not BigInt. We generate a 48-bit random int (max 2^48-1).
 *   - `side` on the WIRE format is the literal "BUY"/"SELL", but in the EIP-712
 *     hash it's a uint8 (0 or 1). We sign one shape, send another.
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
 * Wire format sent to Polymarket CLOB `/order` (matches `orderToJson` output
 * in clob-client/utilities.ts). All numeric fields are decimal strings
 * EXCEPT salt (number) and signatureType (number).
 */
export interface SignedClobOrder {
  /** Number — must fit in JS Number (server uses parseInt). 48-bit safe. */
  salt: number;
  maker: `0x${string}`;
  signer: `0x${string}`;
  taker: `0x${string}`;
  tokenId: string;       // ERC1155 outcome id (huge decimal string)
  makerAmount: string;   // base units (6 decimals)
  takerAmount: string;   // base units (6 decimals)
  expiration: string;    // unix seconds; "0" = GTC
  nonce: string;
  feeRateBps: string;
  /** "BUY" or "SELL" on the wire (NOT the uint8 used in EIP-712). */
  side: "BUY" | "SELL";
  /** 0 = EOA. */
  signatureType: number;
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

  // 48-bit random salt — fits inside JS Number safely (Number.MAX_SAFE_INTEGER
  // is 2^53 - 1, so 2^48 leaves plenty of headroom).
  // Nonce is allowed to be any uint256 (used purely on-chain for cancels).
  const saltNum = randomU48();
  const nonceBig = randomU256();

  // ── EIP-712 message: side / signatureType are uint8 (numbers).  ────────────
  // The DOMAIN, TYPES, and salt-as-bigint are all required for the hash to
  // match what the on-chain Exchange computes.
  const eip712Message = {
    salt: BigInt(saltNum),
    maker: owner,
    signer: owner,
    taker: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    tokenId: BigInt(tokenId),
    makerAmount: makerAmount,
    takerAmount: takerAmount,
    expiration: ORDER_EXPIRATION_GTC,
    nonce: nonceBig,
    feeRateBps: ORDER_FEE_RATE_BPS,
    side: OrderSide.BUY as number, // uint8 in TS -> 0
    signatureType: SignatureType.EOA as number, // uint8 in TS -> 0
  };

  const domain = buildOrderDomain(negRisk);
  const signature = await walletClient.signTypedData({
    account: owner,
    domain,
    types: ORDER_TYPES,
    primaryType: "Order",
    message: eip712Message,
  });

  // ── Wire format: salt as Number, side as "BUY"/"SELL". ─────────────────────
  return {
    salt: saltNum,
    maker: eip712Message.maker,
    signer: eip712Message.signer,
    taker: eip712Message.taker,
    tokenId: eip712Message.tokenId.toString(),
    makerAmount: eip712Message.makerAmount.toString(),
    takerAmount: eip712Message.takerAmount.toString(),
    expiration: eip712Message.expiration.toString(),
    nonce: eip712Message.nonce.toString(),
    feeRateBps: eip712Message.feeRateBps.toString(),
    side: "BUY",
    signatureType: SignatureType.EOA,
    signature,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** Cryptographically random 48-bit unsigned int as JS Number. Safe for parseInt. */
function randomU48(): number {
  const bytes = new Uint8Array(6); // 6 * 8 = 48 bits
  crypto.getRandomValues(bytes);
  let n = 0;
  for (const b of bytes) n = n * 256 + b;
  return n;
}

/** Cryptographically random 256-bit unsigned int as bigint. */
function randomU256(): bigint {
  const bytes = new Uint8Array(32);
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    throw new Error("crypto.getRandomValues unavailable");
  }
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex);
}
