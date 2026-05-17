/**
 * Polymarket L2 API Key derivation & local cache.
 *
 * Why this exists:
 *   Polymarket's CLOB requires every authenticated request to carry HMAC-SHA256
 *   headers signed with an "API Key + Secret + Passphrase" triple that's
 *   *derived from* an EIP-712 signature over a deterministic message.
 *   This means the user signs ONCE, we derive the credentials, then reuse them
 *   for every subsequent order without bothering the wallet.
 *
 * We cache the derived triple in localStorage keyed by EOA address so that
 * users only see the wallet popup the first time they trade.
 *
 * Reference (the message + endpoint format is documented):
 *   https://docs.polymarket.com/developers/CLOB/authentication
 *   https://github.com/Polymarket/clob-client/blob/main/src/headers.ts
 */

import type { WalletClient } from "viem";
import { CLOB_HOST, POLYGON_CHAIN_ID } from "./constants";

export interface ClobApiCreds {
  apiKey: string;
  secret: string;     // base64-encoded
  passphrase: string;
  /** Address that owns these creds (lowercase). */
  owner: `0x${string}`;
  /** Unix ms when derived. */
  derivedAt: number;
}

const STORAGE_KEY = "canteen.polymarket.creds.v1";

// ── local cache ─────────────────────────────────────────────────────────────

export function loadCachedCreds(owner: `0x${string}`): ClobApiCreds | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClobApiCreds;
    if (parsed.owner.toLowerCase() !== owner.toLowerCase()) return null;
    if (!parsed.apiKey || !parsed.secret || !parsed.passphrase) return null;
    return parsed;
  } catch {
    return null;
  }
}

function cacheCreds(creds: ClobApiCreds): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    /* quota exceeded — non-fatal */
  }
}

export function clearCachedCreds(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// ── derivation ──────────────────────────────────────────────────────────────

/**
 * The EIP-712 typed-data Polymarket asks the user to sign for L2-creds derivation.
 * Mirrors `clob-client/src/signing/sign.ts` POLY_API_KEY function.
 */
const CLOB_AUTH_DOMAIN = {
  name: "ClobAuthDomain",
  version: "1",
  chainId: POLYGON_CHAIN_ID,
} as const;

const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
} as const;

const CLOB_AUTH_MESSAGE =
  "This message attests that I control the given wallet";

/**
 * Derive (or fetch) the L2 API creds for `owner`.
 *
 * Flow:
 *   1. Wallet signs the ClobAuth typed-data (1 popup).
 *   2. POST to `/auth/derive-api-key` with the signature & timestamp.
 *      → server returns { apiKey, secret, passphrase }.
 *   3. Cache to localStorage and return.
 *
 * If the user already has creds on Polymarket's side (e.g. they signed up
 * before via Polymarket UI), the server returns the existing creds.
 *
 * Important: this whole call is proxied through our /api/trade/derive-key
 * route (region: hkg1) to dodge geo restrictions.
 */
export async function deriveOrLoadCreds(
  walletClient: WalletClient,
  owner: `0x${string}`,
): Promise<ClobApiCreds> {
  const cached = loadCachedCreds(owner);
  if (cached) return cached;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = 0n;

  const signature = await walletClient.signTypedData({
    account: owner,
    domain: CLOB_AUTH_DOMAIN,
    types: CLOB_AUTH_TYPES,
    primaryType: "ClobAuth",
    message: {
      address: owner,
      timestamp,
      nonce,
      message: CLOB_AUTH_MESSAGE,
    },
  });

  // Proxy through our Vercel route to bypass Polymarket geo-blocks.
  const res = await fetch("/api/trade/derive-key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      address: owner,
      signature,
      timestamp,
      nonce: "0",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`derive-key ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    apiKey: string;
    secret: string;
    passphrase: string;
  };

  if (!json.apiKey || !json.secret || !json.passphrase) {
    throw new Error("derive-key: missing fields in response");
  }

  const creds: ClobApiCreds = {
    apiKey: json.apiKey,
    secret: json.secret,
    passphrase: json.passphrase,
    owner: owner.toLowerCase() as `0x${string}`,
    derivedAt: Date.now(),
  };
  cacheCreds(creds);
  return creds;
}

// ── HMAC headers for authenticated requests ──────────────────────────────────

/**
 * Build the L2 auth headers required by /order.
 * Server-side (in our Vercel proxy) we'll compute these — they include an
 * HMAC-SHA256 over: `timestamp + method + path + body`.
 */
export interface ClobAuthHeaders {
  POLY_ADDRESS: string;
  POLY_SIGNATURE: string;
  POLY_TIMESTAMP: string;
  POLY_API_KEY: string;
  POLY_PASSPHRASE: string;
}

export const CLOB_HOST_PUBLIC = CLOB_HOST;
