"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketSummary, InsightReport } from "@canteen/shared/insight";
import { ProbabilityBar } from "@/components/market/ProbabilityBar";
import { UnlockButton } from "@/components/insight/UnlockButton";
import { InsightReport as InsightReportView } from "@/components/insight/InsightReport";
import { EvidencePanel } from "@/components/insight/EvidencePanel";
import { TradeButton } from "@/components/trade/TradeButton";
import { useInsightStore } from "@/stores/insight-store";
import { useHistoryStore } from "@/stores/history-store";
import {
  ChevronLeft,
  Calendar,
  BarChart3,
  Layers,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { cn, formatUsd } from "@/lib/utils";
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

  // ── Outcome selector (multi-candidate events only) ──────────────────────
  // Default to the leader (top of the list, already sorted by prob in
  // gamma.ts). State holds the selected outcome's `id`.
  const outcomes = market.outcomes ?? [];
  const isMulti = outcomes.length > 1;
  const [selectedId, setSelectedId] = useState<string>(
    outcomes[0]?.id ?? market.id,
  );
  const selected = useMemo(
    () => outcomes.find((o) => o.id === selectedId) ?? outcomes[0],
    [outcomes, selectedId],
  );

  /**
   * "Active" market driving the hero price + TradeButton + Unlock query.
   *
   *  - Binary event → just `market` verbatim.
   *  - Multi-outcome → swap in the selected candidate's clob ids / tickSize
   *    / yesProb so downstream components don't need to know about events.
   */
  const activeMarket: MarketSummary = useMemo(() => {
    if (!isMulti || !selected) return market;
    return {
      ...market,
      // Keep `id` = event id (so history / insight store stay event-scoped),
      // but route the trade pipeline to the chosen candidate.
      question: selected.question,
      yesProb: selected.prob,
      clobTokenIds: selected.clobTokenIds ?? market.clobTokenIds,
      tickSize: selected.tickSize ?? market.tickSize,
      minOrderSize: selected.minOrderSize ?? market.minOrderSize,
      negRisk: selected.negRisk ?? market.negRisk,
    };
  }, [isMulti, selected, market]);

  // Rehydrate the insight store from local history on first mount so the user
  // can come back to a previously-unlocked event and still see the report.
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
  const eventQuestion = isFallback
    ? t("event.fallbackQuestion", { id: market.id })
    : market.question;
  const description = isFallback ? t("event.fallbackDesc") : market.description;
  const category = market.category || t("markets.cat.General");

  // For the hero label: in multi-outcome mode we show the EVENT title
  // (e.g. "2026 NHL Stanley Cup Champion") and the selected candidate's
  // probability below.
  const heroTitle = eventQuestion;
  const heroProb = activeMarket.yesProb;

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
                {heroTitle}
              </h1>
              {isMulti && selected ? (
                <p className="mt-2 text-sm text-foreground-muted">
                  <span className="text-foreground-dim">→ </span>
                  <span className="font-medium text-white">{selected.label}</span>
                </p>
              ) : null}
              {description ? (
                <p className="mt-2 text-sm text-foreground-muted line-clamp-3">
                  {description}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PricePill side="YES" prob={heroProb} />
            <PricePill side="NO" prob={1 - heroProb} />
          </div>
          <ProbabilityBar yesProb={heroProb} size="lg" />

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
            <UnlockButton
              eventId={market.id}
              question={activeMarket.question}
            />
          </div>
          <div className="glass-card p-6 space-y-3">
            <div className="text-xs uppercase tracking-wider text-foreground-dim">
              {t("event.tradeTitle")}
            </div>
            <TradeButton market={activeMarket} verdict={verdict} />
          </div>
        </div>
      </section>

      {/* ── Candidate picker (multi-outcome only) ─────────────────────── */}
      {isMulti ? (
        <section className="glass-card p-6 space-y-3">
          <div>
            <div className="text-sm font-semibold">
              {t("event.outcomes.title")}
            </div>
            <div className="text-xs text-foreground-dim mt-0.5">
              {t("event.outcomes.hint")}
            </div>
          </div>
          <ul className="space-y-2">
            {outcomes.map((o) => {
              const active = o.id === selectedId;
              const pct = Math.round(o.prob * 100);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(o.id)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                      active
                        ? "border-accent/50 bg-accent/10"
                        : "border-border hover:border-white/20 hover:bg-white/5",
                    )}
                  >
                    <div
                      className={cn(
                        "shrink-0 grid h-5 w-5 place-items-center rounded-full border",
                        active
                          ? "border-accent text-accent"
                          : "border-border text-transparent",
                      )}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "text-sm font-medium truncate",
                          active ? "text-white" : "text-foreground-muted",
                        )}
                      >
                        {o.label}
                      </div>
                      <div className="mt-1.5 relative h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className={cn(
                            "absolute inset-y-0 left-0",
                            active
                              ? "bg-gradient-to-r from-accent to-yes"
                              : "bg-white/20",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div
                      className={cn(
                        "text-sm font-bold tabular-nums w-12 text-right",
                        active ? "text-yes" : "text-foreground-muted",
                      )}
                    >
                      {pct}%
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

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
      <span className={`text-sm font-semibold ${yes ? "text-yes" : "text-no"}`}>
        {side}
      </span>
      <span className={`text-2xl font-bold ${yes ? "text-yes" : "text-no"}`}>
        {Math.round(prob * 100)}%
      </span>
    </div>
  );
}
