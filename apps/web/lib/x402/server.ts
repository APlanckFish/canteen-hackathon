import {
  decodePaymentProof,
  encodePaymentProof,
  X402_AUTH_SCHEME,
  X402_HEADER,
  X402_VERSION,
  type X402Challenge,
  type X402ErrorCode,
  type X402PaymentProof,
} from "@canteen/shared/x402";
import { paymentVaultAbi } from "@canteen/shared/abi";
import { keccak256, parseEventLogs, toHex, type Hex } from "viem";
import { nanoid } from "nanoid";
import { publicEnv } from "@/lib/env";
import { getArcClient } from "@/lib/viem";
import { getKv, KV_KEYS } from "@/lib/kv";
import { usdcToBaseUnits } from "@/lib/utils";

const CHALLENGE_TTL_SECONDS = 300; // 5 min
const NONCE_BIT_SIZE = 80; // ~10 bytes random + ts → fits uint256 easily

/** Convert any string event slug → bytes32 hex used onchain. */
export function eventIdToBytes32(slug: string): Hex {
  return keccak256(toHex(slug));
}

export function buildChallenge(opts: {
  eventId: string;
  payer?: `0x${string}`;
  resource: string;
}): X402Challenge {
  if (!publicEnv.NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS) {
    throw new Error("NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS not configured");
  }
  if (!publicEnv.NEXT_PUBLIC_USDC_ARC_ADDRESS) {
    throw new Error("NEXT_PUBLIC_USDC_ARC_ADDRESS not configured");
  }
  const ts = Math.floor(Date.now() / 1000);
  // Pack timestamp + random into a uint256-friendly decimal nonce.
  const rand = BigInt("0x" + nanoid(16).replace(/[^a-f0-9]/gi, "0").slice(0, 16));
  const nonce =
    (BigInt(ts) << BigInt(NONCE_BIT_SIZE)) | (rand & ((1n << 80n) - 1n));

  return {
    version: X402_VERSION,
    chainId: publicEnv.NEXT_PUBLIC_ARC_CHAIN_ID,
    recipient: publicEnv.NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS,
    asset: publicEnv.NEXT_PUBLIC_USDC_ARC_ADDRESS,
    amount: usdcToBaseUnits(publicEnv.NEXT_PUBLIC_INSIGHT_PRICE_USDC).toString(),
    eventId: eventIdToBytes32(opts.eventId),
    nonce: nonce.toString(),
    deadline: ts + CHALLENGE_TTL_SECONDS,
    resource: opts.resource,
  };
}

/** Persist challenge so we can match a later proof against it. */
export async function rememberChallenge(challenge: X402Challenge): Promise<void> {
  const kv = getKv();
  await kv.set(
    KV_KEYS.challenge(challenge.eventId, challenge.nonce),
    JSON.stringify(challenge),
    { ex: CHALLENGE_TTL_SECONDS + 30 },
  );
}

export interface X402VerifyResult {
  ok: true;
  proof: X402PaymentProof;
  challenge: X402Challenge;
  blockNumber: bigint;
}
export interface X402VerifyError {
  ok: false;
  code: X402ErrorCode;
  message: string;
}

/**
 * Verify an X-PAYMENT header against the challenge stored in KV and the on-chain
 * `Paid` event. Replays are blocked via a KV consumed-set keyed by txHash.
 */
export async function verifyPayment(
  headerValue: string,
): Promise<X402VerifyResult | X402VerifyError> {
  let proof: X402PaymentProof;
  try {
    proof = decodePaymentProof(headerValue);
  } catch (e) {
    return {
      ok: false,
      code: "X402_INVALID_PROOF",
      message: `Failed to decode X-PAYMENT header: ${(e as Error).message}`,
    };
  }

  const kv = getKv();

  // Replay protection.
  const already = await kv.get<string>(KV_KEYS.consumed(proof.txHash));
  if (already) {
    return {
      ok: false,
      code: "X402_NONCE_REPLAYED",
      message: "This payment has already been consumed.",
    };
  }

  const challengeRaw = await kv.get<string>(
    KV_KEYS.challenge(proof.eventId, proof.nonce),
  );
  if (!challengeRaw) {
    return {
      ok: false,
      code: "X402_INVALID_PROOF",
      message: "Challenge not found or expired.",
    };
  }
  const challenge = JSON.parse(challengeRaw) as X402Challenge;

  if (challenge.deadline < Math.floor(Date.now() / 1000)) {
    return {
      ok: false,
      code: "X402_DEADLINE_EXPIRED",
      message: "Payment challenge expired.",
    };
  }

  const arc = getArcClient();
  let receipt;
  try {
    receipt = await arc.waitForTransactionReceipt({
      hash: proof.txHash,
      timeout: 30_000,
      pollingInterval: 2_000,
    });
  } catch (e) {
    return {
      ok: false,
      code: "X402_TX_NOT_FOUND",
      message: `On-chain receipt not found: ${(e as Error).message}`,
    };
  }
  if (receipt.status !== "success") {
    return {
      ok: false,
      code: "X402_INVALID_PROOF",
      message: "Transaction reverted on-chain.",
    };
  }

  // Parse Paid logs and require a perfect match.
  const parsed = parseEventLogs({
    abi: paymentVaultAbi,
    eventName: "Paid",
    logs: receipt.logs,
  });

  const match = parsed.find((log) => {
    const a = log.args;
    return (
      log.address.toLowerCase() === challenge.recipient.toLowerCase() &&
      a.payer?.toLowerCase() === proof.payer.toLowerCase() &&
      a.eventId === challenge.eventId &&
      a.nonce !== undefined &&
      a.nonce.toString() === challenge.nonce &&
      a.amount !== undefined &&
      a.amount >= BigInt(challenge.amount)
    );
  });

  if (!match) {
    return {
      ok: false,
      code: "X402_RECIPIENT_MISMATCH",
      message:
        "No matching Paid log found. Ensure the payment used PaymentVault.pay() with the exact nonce/eventId.",
    };
  }

  // Mark consumed (TTL = 24h is plenty for replay protection).
  await kv.set(KV_KEYS.consumed(proof.txHash), "1", { ex: 86_400 });

  return {
    ok: true,
    proof,
    challenge,
    blockNumber: receipt.blockNumber,
  };
}

/** Construct the standard 402 response body + headers. */
export function build402Response(challenge: X402Challenge, message?: string) {
  const body = {
    ok: false as const,
    code: "X402_PAYMENT_REQUIRED" as const,
    message: message ?? "Payment required to unlock AI insight.",
    challenge,
  };
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "www-authenticate": `${X402_AUTH_SCHEME} realm="canteen-insight"`,
      "x-x402-version": X402_VERSION,
    },
  });
}

export { X402_HEADER, encodePaymentProof };
