/**
 * Detect what kind of Polymarket-managed wallet a funder address is.
 *
 * Polymarket assigns one of these to each user, depending on how they
 * onboarded:
 *   - Magic / Email login   → POLY_PROXY  (sigType 1)
 *   - Browser wallet login  → POLY_GNOSIS_SAFE (sigType 2) — modified Gnosis Safe
 *   - New API users (post 2026-04-28) → POLY_1271 deposit wallet (sigType 3)
 *
 * The wrong sigType at order signing causes the CLOB server to reject with
 * "the order signer address has to be the address of the API KEY" or
 * similar. So we MUST detect the actual contract before submitting.
 *
 * Detection strategy: probe well-known view methods unique to each kind.
 *   - Gnosis Safe:    has `getOwners() returns (address[])`, `VERSION()`,
 *                     `masterCopy()`, `getThreshold()`.
 *   - Polymarket Proxy: has `computeProxyAddress(address)` only on factory;
 *                     the proxy itself has different shape — we treat
 *                     "not Safe" + "small bytecode" as proxy.
 *   - Deposit Wallet: has `nonce() returns (uint256)` and is from the
 *                     deposit-wallet factory `0x00000000000Fb5C9...`.
 */

import type { PublicClient } from "viem";

export type WalletKind =
  | "GNOSIS_SAFE" // sigType 2
  | "POLY_PROXY" // sigType 1
  | "DEPOSIT_WALLET" // sigType 3
  | "EOA" // sigType 0 (plain account, no contract)
  | "UNKNOWN";

const SAFE_ABI = [
  {
    type: "function",
    name: "VERSION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "getOwners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "getThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * Identify the wallet kind for `address`. Calls a few view methods; if any
 * succeed we're confident enough about the kind. Otherwise returns UNKNOWN
 * (or EOA for a non-contract address).
 */
export async function detectWalletKind(
  publicClient: PublicClient,
  address: `0x${string}`,
): Promise<{
  kind: WalletKind;
  details: {
    safeVersion?: string;
    safeOwners?: readonly `0x${string}`[];
    safeThreshold?: bigint;
    bytecodeLen: number;
  };
}> {
  // 1) Check if it's a contract at all.
  const code = await publicClient.getCode({ address });
  const bytecodeLen = code ? code.length : 0;

  if (!code || code === "0x") {
    return { kind: "EOA", details: { bytecodeLen } };
  }

  // 2) Try Safe-specific view methods.
  try {
    const [version, owners, threshold] = await Promise.all([
      publicClient.readContract({
        address,
        abi: SAFE_ABI,
        functionName: "VERSION",
      }) as Promise<string>,
      publicClient.readContract({
        address,
        abi: SAFE_ABI,
        functionName: "getOwners",
      }) as Promise<readonly `0x${string}`[]>,
      publicClient.readContract({
        address,
        abi: SAFE_ABI,
        functionName: "getThreshold",
      }) as Promise<bigint>,
    ]);
    if (version && owners && owners.length > 0) {
      return {
        kind: "GNOSIS_SAFE",
        details: {
          safeVersion: version,
          safeOwners: owners,
          safeThreshold: threshold,
          bytecodeLen,
        },
      };
    }
  } catch {
    /* not a Safe */
  }

  // 3) For other wallet types we don't have a 100%-clean discriminator that
  //    works without extra setup. Heuristic: very small bytecode (<500
  //    chars) is typical of CREATE2 minimal proxies (deposit wallet). Note
  //    Safe proxies are also small but we already filtered those above.
  if (bytecodeLen > 0 && bytecodeLen < 500) {
    return { kind: "DEPOSIT_WALLET", details: { bytecodeLen } };
  }

  // 4) Bigger contract — likely Polymarket Proxy.
  return { kind: "POLY_PROXY", details: { bytecodeLen } };
}

/**
 * Map our internal WalletKind to the SDK's SignatureTypeV2 enum value.
 * Caller passes this to `new ClobClient({ signatureType, ... })`.
 */
export function walletKindToSigType(kind: WalletKind): number {
  switch (kind) {
    case "EOA":
      return 0; // SignatureTypeV2.EOA
    case "POLY_PROXY":
      return 1; // SignatureTypeV2.POLY_PROXY
    case "GNOSIS_SAFE":
      return 2; // SignatureTypeV2.POLY_GNOSIS_SAFE
    case "DEPOSIT_WALLET":
      return 3; // SignatureTypeV2.POLY_1271
    case "UNKNOWN":
    default:
      // Best guess: assume Safe since that's by far the most common
      // (matches Polymarket's pre-2026 onboarding for browser-wallet users).
      return 2;
  }
}
