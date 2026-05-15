"use client";

import { useEffect } from "react";
import { Lock, ShieldCheck, Loader2, Zap } from "lucide-react";
import { usePayAndUnlock } from "@/hooks/usePayAndUnlock";
import { useInsightStore } from "@/stores/insight-store";
import { useHistoryStore } from "@/stores/history-store";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import { useT } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dict";
import { TxLink } from "@/components/common/TxLink";

interface Props {
  eventId: string;
  question: string;
  className?: string;
}

const STAGE_KEY: Record<string, DictKey> = {
  idle: "unlock.idle",
  preparing: "unlock.preparing",
  approving: "unlock.approving",
  paying: "unlock.paying",
  confirming: "unlock.confirming",
  streaming: "unlock.streaming",
  done: "unlock.done",
  error: "unlock.error",
};

export function UnlockButton({ eventId, question, className }: Props) {
  const { address } = useAccount();
  const apply = useInsightStore((s) => s.apply);
  const reset = useInsightStore((s) => s.reset);
  const addHistory = useHistoryStore((s) => s.add);
  const { t, locale } = useT();

  const { unlock, stage, error, txHash, insightPriceUsdc } = usePayAndUnlock({
    eventId,
    onEvent: (e) => {
      apply(eventId, e);
      if (e.type === "done" && address) {
        // Pull the final slice synchronously from the store so we get summary
        // + evidences (which arrived as separate stream events).
        const slice = useInsightStore.getState().byEvent[eventId];
        addHistory({
          eventId,
          question,
          txHash: e.report.txHash,
          payer: address,
          amountUsdc: insightPriceUsdc,
          unlockedAt: e.report.generatedAt,
          verdict: e.report.verdict,
          summary: slice?.summary || e.report.summary,
          evidences: slice?.evidences ?? e.report.evidences,
          sourceMeta: e.report.sourceMeta ?? slice?.sourceMeta,
          locale,
        });
      }
    },
  });

  useEffect(() => {
    // On every navigation we DO NOT clear the slice if there's already a
    // persisted history entry — the parent (EventDetailClient) handles
    // rehydration. We only reset when there's truly nothing to show.
    const existingSlice = useInsightStore.getState().byEvent[eventId];
    if (!existingSlice || !existingSlice.report) {
      reset(eventId);
    }
  }, [eventId, reset]);

  const busy = ["preparing", "approving", "paying", "confirming", "streaming"].includes(stage);

  // Wrap unlock so every click clears the previous run's slice
  // (summary / evidences / verdict / report) before starting a new stream.
  // Without this, `delta` events keep appending to the prior summary and
  // the UI shows the new analysis stacked under the old one.
  const handleClick = () => {
    reset(eventId);
    unlock();
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || !address}
        className={cn("neon-button h-12 px-6 text-base", busy && "cursor-progress")}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : stage === "done" ? (
          <ShieldCheck className="h-4 w-4" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
        <span>
          {!address
            ? t("unlock.connect")
            : stage === "idle" || stage === "error"
              ? t("unlock.cta", { price: insightPriceUsdc })
              : t(STAGE_KEY[stage] ?? "unlock.idle")}
        </span>
      </button>
      <div className="text-xs text-foreground-muted flex items-center gap-1.5">
        <Zap className="h-3 w-3 text-accent" />
        {t("unlock.subtle")}
      </div>
      {txHash ? (
        <div className="text-xs text-foreground-dim flex items-center gap-1.5">
          <span>{t("unlock.tx")}:</span>
          <TxLink hash={txHash} />
        </div>
      ) : null}
      {error ? <div className="text-xs text-no">{error}</div> : null}
    </div>
  );
}
