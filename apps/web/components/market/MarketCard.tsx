"use client";

import Link from "next/link";
import type { MarketSummary } from "@canteen/shared/insight";
import { cn, formatUsd } from "@/lib/utils";
import { ProbabilityBar } from "./ProbabilityBar";
import { Flame, ArrowUpRight, Clock } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

const TOP_OUTCOMES_VISIBLE = 3;

export function MarketCard({
  market,
  featured = false,
}: {
  market: MarketSummary;
  featured?: boolean;
}) {
  const ends = market.endDate ? new Date(market.endDate) : null;
  const days = ends
    ? Math.max(0, Math.round((ends.getTime() - Date.now()) / 86400000))
    : null;
  const { t } = useT();

  const isMulti = (market.outcomes?.length ?? 0) > 1;

  return (
    <Link
      href={`/event/${encodeURIComponent(market.id)}`}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-border bg-background-card/70 p-4 transition-all",
        "hover:border-white/20 hover:bg-background-card hover:shadow-neon",
        featured && "lg:p-5",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {market.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={market.imageUrl}
              alt=""
              className="h-12 w-12 rounded-lg object-cover ring-1 ring-white/10"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-accent/30 to-yes/30" />
          )}
          {market.hotness !== undefined ? (
            <div className="absolute -bottom-1 -right-1 inline-flex items-center gap-0.5 rounded-full bg-background-elevated px-1.5 py-0.5 text-[10px] font-semibold text-warn ring-1 ring-warn/30">
              <Flame className="h-2.5 w-2.5" /> {market.hotness}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white group-hover:text-accent-glow">
            {market.question}
          </h3>
          {market.aiTag ? (
            <span className="mt-1 inline-block pill-accent text-[10px]">
              {market.aiTag}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Outcomes ─────────────────────────────────────────────────── */}
      {isMulti ? (
        <MultiOutcomeList outcomes={market.outcomes!} />
      ) : (
        <BinaryOutcome yesProb={market.yesProb} />
      )}

      <div className="flex items-center justify-between text-[11px] text-foreground-dim">
        <span>
          {t("card.volume24h", {
            value: formatUsd(market.volume24h, { compact: true }),
          })}
        </span>
        {days !== null ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {t("card.daysLeft", { n: days })}
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex items-center justify-between">
        <span className="pill-muted text-[10px]">
          {market.category ?? t("markets.cat.General")}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-accent group-hover:text-accent-glow">
          {t("card.aiInsight")} <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

/** Plain YES/NO binary view — used for 1-market events. */
function BinaryOutcome({ yesProb }: { yesProb: number }) {
  const { t } = useT();
  return (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-yes">
          {t("card.yes", { pct: `${Math.round(yesProb * 100)}%` })}
        </span>
        <span className="font-medium text-no">
          {t("card.no", { pct: `${Math.round((1 - yesProb) * 100)}%` })}
        </span>
      </div>
      <ProbabilityBar yesProb={yesProb} size="sm" />
    </>
  );
}

/** Top-K candidate list — used for multi-outcome (negRisk) events. */
function MultiOutcomeList({
  outcomes,
}: {
  outcomes: NonNullable<MarketSummary["outcomes"]>;
}) {
  const { t } = useT();
  const visible = outcomes.slice(0, TOP_OUTCOMES_VISIBLE);
  const hidden = outcomes.length - visible.length;

  return (
    <ul className="space-y-1.5">
      {visible.map((o, i) => {
        const pct = Math.round(o.prob * 100);
        return (
          <li key={i} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate text-foreground-muted">{o.label}</span>
              <span className="font-medium text-yes ml-2 tabular-nums">
                {pct}%
              </span>
            </div>
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent to-yes"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
      {hidden > 0 ? (
        <li className="pt-0.5 text-[10px] text-foreground-dim">
          {t("card.moreOutcomes", { n: hidden })}
        </li>
      ) : null}
    </ul>
  );
}
