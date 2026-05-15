/**
 * x402 protocol shared types & constants.
 *
 * Wire format aligned with Coinbase x402 spec:
 *   - Server returns HTTP 402 with `WWW-Authenticate: x402` header and JSON body
 *     containing the payment requirement (challenge).
 *   - Client signs an on-chain payment, then resubmits with `X-PAYMENT` header
 *     carrying the proof (txHash + payer).
 */

export const X402_VERSION = "1" as const;
export const X402_HEADER = "X-PAYMENT" as const;
export const X402_AUTH_SCHEME = "x402" as const;

export interface X402Challenge {
  version: typeof X402_VERSION;
  chainId: number;
  /** PaymentVault contract address that should receive the funds. */
  recipient: `0x${string}`;
  /** ERC20 asset address (USDC on Arc Testnet). */
  asset: `0x${string}`;
  /** Amount in token base units (e.g. USDC has 6 decimals → "500000" = 0.5 USDC). */
  amount: string;
  /** Application-level event identifier (bytes32 hex). */
  eventId: `0x${string}`;
  /** Server-issued nonce, also recorded onchain via `pay()`. */
  nonce: string;
  /** Unix seconds. Challenges expire after deadline. */
  deadline: number;
  /** Original resource URL the user is trying to access. */
  resource: string;
}

export interface X402PaymentProof {
  version: typeof X402_VERSION;
  chainId: number;
  /** Transaction hash of the on-chain pay() call. */
  txHash: `0x${string}`;
  /** Wallet address that signed the on-chain payment. */
  payer: `0x${string}`;
  eventId: `0x${string}`;
  nonce: string;
}

export interface X402ErrorBody {
  ok: false;
  code: X402ErrorCode;
  message: string;
  challenge?: X402Challenge;
}

export type X402ErrorCode =
  | "X402_PAYMENT_REQUIRED"
  | "X402_INVALID_PROOF"
  | "X402_TX_NOT_FOUND"
  | "X402_TX_PENDING"
  | "X402_NONCE_REPLAYED"
  | "X402_AMOUNT_INSUFFICIENT"
  | "X402_DEADLINE_EXPIRED"
  | "X402_RECIPIENT_MISMATCH"
  | "X402_INTERNAL";

/**
 * Encodes proof object → base64 JSON, suitable for the X-PAYMENT header value.
 */
export function encodePaymentProof(proof: X402PaymentProof): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(JSON.stringify(proof), "utf-8").toString("base64");
  }
  // Browser fallback
  return btoa(unescape(encodeURIComponent(JSON.stringify(proof))));
}

export function decodePaymentProof(headerValue: string): X402PaymentProof {
  let json: string;
  if (typeof Buffer !== "undefined") {
    json = Buffer.from(headerValue, "base64").toString("utf-8");
  } else {
    json = decodeURIComponent(escape(atob(headerValue)));
  }
  const parsed = JSON.parse(json) as X402PaymentProof;
  if (parsed.version !== X402_VERSION) {
    throw new Error(`Unsupported x402 proof version: ${parsed.version}`);
  }
  return parsed;
}
