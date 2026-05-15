"use client";

import {
  X402_HEADER,
  X402_VERSION,
  encodePaymentProof,
  type X402Challenge,
  type X402PaymentProof,
} from "@canteen/shared/x402";

export type X402PaymentExecutor = (
  challenge: X402Challenge,
) => Promise<X402PaymentProof>;

/**
 * Fetch wrapper that performs the x402 three-step dance:
 *   1) initial request → 402 + challenge in body
 *   2) call `executor` (typically wagmi writeContract → returns proof)
 *   3) re-issue request with X-PAYMENT header attached
 *
 * `signal` and `onStage` make the UI observable without forcing SSE here.
 */
export async function fetchWithX402(
  url: string,
  init: RequestInit,
  executor: X402PaymentExecutor,
  hooks?: {
    signal?: AbortSignal;
    onChallenge?: (c: X402Challenge) => void;
    onProof?: (p: X402PaymentProof) => void;
  },
): Promise<Response> {
  const first = await fetch(url, { ...init, signal: hooks?.signal });
  if (first.status !== 402) return first;

  const data = (await first.clone().json()) as {
    challenge: X402Challenge;
    message?: string;
  };
  if (!data.challenge) {
    throw new Error("Server returned 402 without a challenge body");
  }
  hooks?.onChallenge?.(data.challenge);

  const proof = await executor(data.challenge);
  hooks?.onProof?.(proof);

  const headers = new Headers(init.headers ?? {});
  headers.set(X402_HEADER, encodePaymentProof(proof));
  headers.set("x-x402-version", X402_VERSION);

  return fetch(url, { ...init, headers, signal: hooks?.signal });
}
