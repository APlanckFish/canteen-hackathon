"use client";

import { useInsightStore } from "@/stores/insight-store";
import { Loader2, ShieldCheck, AlertTriangle, Sparkles, Activity } from "lucide-react";
import { cn, formatPct, formatUsd } from "@/lib/utils";
import type { InsightStage } from "@canteen/shared/insight";
import { useT } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dict";
import { publicEnv } from "@/lib/env";
import { DemoBadge } from "./DemoBadge";
import { MarkdownView } from "./MarkdownView";
import { useIntegrations } from "@/hooks/useIntegrations";
import { TxLink } from "@/components/common/TxLink";

const STAGE_KEY: Record<InsightStage | "idle", DictKey> = {
  idle: "report.stage.idle",
  validating_payment: "report.stage.validating_payment",
  planning: "report.stage.planning",
  fetching_evidence: "report.stage.fetching_evidence",
  analyzing: "report.stage.analyzing",
  finalizing: "report.stage.finalizing",
};

export function InsightReport({ eventId }: { eventId: string }) {
  const slice = useInsightStore((s) => s.byEvent[eventId]);
  const { t } = useT();
  const integrations = useIntegrations();
  const price = publicEnv.NEXT_PUBLIC_INSIGHT_PRICE_USDC;

  // Pre-unlock state: predict demo mode from server-side env probe so the
  // user knows up-front this run will use stubbed data.
  const inferredDemo = !integrations.deepseek || !integrations.tikhub;

  if (!slice || slice.stage === "idle") {
    return (
      <div className="glass-card p-8 text-center text-foreground-muted space-y-3">
        <Sparkles className="mx-auto h-6 w-6 text-accent" />
        <div>{t("report.empty", { price })}</div>
        {inferredDemo ? (
          <div className="flex justify-center pt-1">
            <DemoBadge forceDemo />
          </div>
        ) : null}
      </div>
    );
  }

  const streaming =
    slice.stage === "analyzing" || slice.stage === "fetching_evidence" || slice.stage === "planning";
  const finished = !!slice.report;

  return (
    <div className="space-y-5">
      {/* Status header */}
      <div className="glass-card flex items-center gap-3 px-4 py-3">
        {finished ? (
          <ShieldCheck className="h-4 w-4 text-yes" />
        ) : slice.error ? (
          <AlertTriangle className="h-4 w-4 text-no" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
        )}
        <div className="flex-1 text-sm">
          <span className="text-white">{t(STAGE_KEY[slice.stage])}</span>
          {slice.message ? (
            <span className="ml-2 text-foreground-muted">· {slice.message}</span>
          ) : null}
        </div>
        <DemoBadge meta={slice.sourceMeta} />
      </div>

      {/* Verdict KPIs */}
      {slice.verdict ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label={t("report.kpi.yesProb")}
            value={formatPct(slice.verdict.yesProb, 0)}
            tone={slice.verdict.yesProb >= 0.5 ? "yes" : "no"}
          />
          <KpiCard
            label={t("report.kpi.confidence")}
            value={formatPct(slice.verdict.confidence, 0)}
            tone="accent"
          />
          <KpiCard
            label={t("report.kpi.side")}
            value={slice.verdict.suggestedSide}
            tone={
              slice.verdict.suggestedSide === "YES"
                ? "yes"
                : slice.verdict.suggestedSide === "NO"
                  ? "no"
                  : "muted"
            }
          />
          <KpiCard
            label={t("report.kpi.size")}
            value={
              slice.verdict.suggestedSide === "SKIP"
                ? "—"
                : formatUsd(slice.verdict.suggestedSizeUsd)
            }
            tone="accent"
          />
        </div>
      ) : null}

      {/* Streaming markdown body */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-foreground-dim">
          <Activity className="h-3 w-3" /> {t("report.live")}
          {streaming ? (
            <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
          ) : null}
        </div>
        <div className="mt-3">
          {slice.summary ? (
            <div className={cn(streaming && "caret")}>
              <MarkdownView source={slice.summary} evidences={slice.evidences} />
            </div>
          ) : (
            <div className="text-foreground-dim">{t("report.streamingHint")}</div>
          )}
        </div>

        {finished && slice.report ? (
          <div className="mt-6 border-t border-border pt-4 text-xs text-foreground-dim flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              {t("report.tx")}
              <TxLink hash={slice.report.txHash} />
            </span>
            <span>
              {t("report.generated", {
                time: new Date(slice.report.generatedAt * 1000).toLocaleString(),
              })}
            </span>
          </div>
        ) : null}

        {slice.error ? (
          <div className="mt-4 rounded-lg bg-no-soft px-3 py-2 text-xs text-no">{slice.error}</div>
        ) : null}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "yes" | "no" | "accent" | "muted";
}) {
  const toneCls: Record<string, string> = {
    yes: "border-yes/30 bg-yes-soft text-yes",
    no: "border-no/30 bg-no-soft text-no",
    accent: "border-accent/30 bg-accent/10 text-accent",
    muted: "border-border bg-white/5 text-foreground-muted",
  };
  return (
    <div className={cn("rounded-2xl border px-4 py-3", toneCls[tone])}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
