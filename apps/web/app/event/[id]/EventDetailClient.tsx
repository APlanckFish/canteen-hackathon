"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { MarketSummary, InsightReport } from "@canteen/shared/insight";
import { ProbabilityBar } from "@/components/market/ProbabilityBar";
import { UnlockButton } from "@/components/insight/UnlockButton";
import { InsightReport as InsightReportView } from "@/components/insight/InsightReport";
import { EvidencePanel } from "@/components/insight/EvidencePanel";
import { TradeButton } from "@/components/trade/TradeButton";
import { useInsightStore } from "@/stores/insight-store";
import { useHistoryStore } from "@/stores/history-store";
import { ChevronLeft, Calendar, BarChart3, Layers, ShieldCheck } from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

export function EventDetailClient({
  market,
  isFallback = false,
}: {
  market: MarketSummary;
  isFallback?: boolean;
}) {
  const verdict = useInsightStore((s) => s.byEvent[market.id]?.verdict);
  const hydrate = useInsightStore((s) => s.hydrate);
  const historyItem = useHistoryStore((s) =>
    s.items.find((it) => it.eventId === market.id),
  );
  const { t } = useT();

  // Rehydrate the insight store from local history on first mount so the user
  // can come back to a previously-unlocked event and still see the report.
  // We only hydrate when the store has no in-memory slice — an in-flight run
  // takes precedence.
  useEffect(() => {
    if (!historyItem) return;
    const cur = useInsightStore.getState().byEvent[market.id];
    if (cur && (cur.stage !== "idle" || cur.summary)) return;
    const restoredReport: InsightReport = {
      eventId: historyItem.eventId,
      txHash: historyItem.txHash,
      generatedAt: historyItem.unlockedAt,
      summary: historyItem.summary ?? "",
      verdict: historyItem.verdict ?? {
        yesProb: 0.5,
        confidence: 0,
        suggestedSide: "SKIP",
        suggestedSizeUsd: 0,
        reasoning: "",
      },
      evidences: historyItem.evidences ?? [],
      sourceMeta: historyItem.sourceMeta,
    };
    hydrate(market.id, {
      summary: historyItem.summary,
      evidences: historyItem.evidences,
      verdict: historyItem.verdict,
      report: restoredReport,
      sourceMeta: historyItem.sourceMeta,
    });
  }, [market.id, historyItem, hydrate]);

  // Resolve fallback texts on the client so they follow current locale.
  const question = isFallback
    ? t("event.fallbackQuestion", { id: market.id })
    : market.question;
  const description = isFallback ? t("event.fallbackDesc") : market.description;
  const category = market.category || t("markets.cat.General");

  return (
    <div className="space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-foreground-muted hover:text-white transition-colors"
      >
        <ChevronLeft className="h-3 w-3" /> {t("event.back")}
      </Link>

      {/* Hero */}
      <section className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 glass-card p-6 lg:p-8 space-y-5">
          <div className="flex items-start gap-4">
            {market.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={market.imageUrl}
                alt=""
                className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/10"
              />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-accent/40 to-yes/40 ring-1 ring-white/10" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="pill-muted text-[10px]">{category}</span>
                {market.endDate ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-foreground-dim">
                    <Calendar className="h-3 w-3" />
                    {t("event.resolves", {
                      date: new Date(market.endDate).toLocaleDateString(),
                    })}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-2 text-2xl lg:text-3xl font-bold leading-tight text-balance">
                {question}
              </h1>
              {description ? (
                <p className="mt-2 text-sm text-foreground-muted line-clamp-3">
                  {description}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PricePill side="YES" prob={market.yesProb} />
            <PricePill side="NO" prob={1 - market.yesProb} />
          </div>
          <ProbabilityBar yesProb={market.yesProb} size="lg" />

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-foreground-dim">
            <span className="inline-flex items-center gap-1.5">
              <BarChart3 className="h-3 w-3" />
              {formatUsd(market.volume24h, { compact: true })} {t("event.volume24h")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3 w-3" />
              {formatUsd(market.liquidity, { compact: true })} {t("event.liquidity")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-yes">
              <ShieldCheck className="h-3 w-3" />
              {t("event.onchainBadge")}
            </span>
          </div>
        </div>

        {/* Action card */}
        <div className="lg:col-span-4 space-y-4">
          <div className="glass-card-strong p-6 space-y-4">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-foreground-dim">
                {t("event.unlockTitle")}
              </div>
              <div className="text-sm text-foreground-muted">
                {t("event.unlockDesc")}
              </div>
            </div>
            <UnlockButton eventId={market.id} question={question} />
          </div>
          <div className="glass-card p-6 space-y-3">
            <div className="text-xs uppercase tracking-wider text-foreground-dim">
              {t("event.tradeTitle")}
            </div>
            <TradeButton market={market} verdict={verdict} />
          </div>
        </div>
      </section>

      {/* Report + evidence */}
      <section className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <InsightReportView eventId={market.id} />
        </div>
        <aside className="lg:col-span-4 lg:sticky lg:top-20 lg:self-start">
          <EvidencePanel eventId={market.id} />
        </aside>
      </section>
    </div>
  );
}

function PricePill({ side, prob }: { side: "YES" | "NO"; prob: number }) {
  const yes = side === "YES";
  return (
    <div
      className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
        yes ? "border-yes/30 bg-yes-soft" : "border-no/30 bg-no-soft"
      }`}
    >
      <span className={`text-sm font-semibold ${yes ? "text-yes" : "text-no"}`}>{side}</span>
      <span className={`text-2xl font-bold ${yes ? "text-yes" : "text-no"}`}>
        {Math.round(prob * 100)}%
      </span>
    </div>
  );
}
