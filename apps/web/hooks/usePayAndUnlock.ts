"use client";

import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { erc20Abi } from "viem";
import { paymentVaultAbi } from "@canteen/shared/abi";
import type { X402Challenge, X402PaymentProof } from "@canteen/shared/x402";
import { fetchWithX402 } from "@/lib/x402/client";
import { publicEnv } from "@/lib/env";
import { arcTestnet } from "@/lib/chains";
import type { InsightStreamEvent } from "@canteen/shared/insight";
import { useT } from "@/lib/i18n/provider";

export type UnlockStage =
  | "idle"
  | "preparing"
  | "approving"
  | "paying"
  | "confirming"
  | "streaming"
  | "done"
  | "error";

interface UseUnlockOpts {
  eventId: string;
  onEvent?: (e: InsightStreamEvent) => void;
}

/**
 * High-level hook that:
 *  1. Hits /api/insight/[eventId], expects 402 + challenge.
 *  2. Approves USDC if necessary, then calls PaymentVault.pay().
 *  3. Re-fetches with X-PAYMENT header and consumes the SSE stream.
 *
 * Designed so the UI can subscribe to stage transitions and per-event payloads.
 */
export function usePayAndUnlock(opts: UseUnlockOpts) {
  const { eventId, onEvent } = opts;
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { locale, t } = useT();

  const [stage, setStage] = useState<UnlockStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const unlock = useCallback(async () => {
    if (!address) {
      setError(t("trade.connectFirst"));
      setStage("error");
      return;
    }
    setError(null);
    setStage("preparing");

    if (chainId !== arcTestnet.id) {
      try {
        await switchChainAsync({ chainId: arcTestnet.id });
      } catch (e) {
        setError((e as Error).message);
        setStage("error");
        return;
      }
    }

    const url = `/api/insight/${encodeURIComponent(eventId)}`;
    let proofResolved: X402PaymentProof | null = null;

    const executor = async (challenge: X402Challenge): Promise<X402PaymentProof> => {
      // Step 1: check existing allowance — skip approve if it's already enough.
      // OKX wallet (and some others) refuse to confirm a follow-up tx until
      // the previous one is mined; we both *check* and *wait* to be safe.
      let needsApprove = true;
      if (publicClient) {
        try {
          const current = (await publicClient.readContract({
            address: challenge.asset,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, challenge.recipient],
          })) as bigint;
          if (current >= BigInt(challenge.amount)) {
            needsApprove = false;
          }
        } catch {
          // RPC hiccup — fall through and just send approve
        }
      }

      if (needsApprove) {
        setStage("approving");
        const approveHash = await writeContractAsync({
          address: challenge.asset,
          abi: erc20Abi,
          functionName: "approve",
          args: [challenge.recipient, BigInt(challenge.amount)],
          chainId: arcTestnet.id,
        });

        // Wait for approve to be mined before prompting `pay`. Without this,
        // OKX Wallet shows an "unknown transaction" dialog with a disabled
        // confirm button because the second tx still sees allowance = 0 on
        // chain when it tries to simulate.
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({
            hash: approveHash,
            confirmations: 1,
            timeout: 30_000,
          });
        }
      }

      setStage("paying");
      const payHash = await writeContractAsync({
        address: challenge.recipient,
        abi: paymentVaultAbi,
        functionName: "pay",
        args: [
          challenge.eventId,
          BigInt(challenge.amount),
          BigInt(challenge.nonce),
        ],
        chainId: arcTestnet.id,
      });

      setTxHash(payHash);
      setStage("confirming");

      proofResolved = {
        version: challenge.version,
        chainId: challenge.chainId,
        txHash: payHash,
        payer: address,
        eventId: challenge.eventId,
        nonce: challenge.nonce,
      };
      return proofResolved;
    };

    let res: Response;
    try {
      res = await fetchWithX402(
        url,
        {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "x-locale": locale,
          },
        },
        executor,
      );
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
      return;
    }

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      setError(`Server rejected proof: ${res.status} ${t.slice(0, 200)}`);
      setStage("error");
      return;
    }

    setStage("streaming");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let parsed: InsightStreamEvent | null = null;
            try {
              parsed = JSON.parse(payload) as InsightStreamEvent;
            } catch {
              continue;
            }
            onEvent?.(parsed);
            if (parsed.type === "error") {
              setError(parsed.message);
              setStage("error");
              return;
            }
            if (parsed.type === "done") {
              setStage("done");
            }
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
      return;
    }
    if (stage !== "error") setStage("done");
  }, [address, chainId, eventId, locale, onEvent, publicClient, stage, switchChainAsync, t, writeContractAsync]);

  return {
    unlock,
    stage,
    error,
    txHash,
    insightPriceUsdc: publicEnv.NEXT_PUBLIC_INSIGHT_PRICE_USDC,
  };
}
