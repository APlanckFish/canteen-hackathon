"use client";

import Link from "next/link";
import type { MarketSummary } from "@canteen/shared/insight";
import { cn, formatUsd } from "@/lib/utils";
import { ProbabilityBar } from "./ProbabilityBar";
import { Flame, ArrowUpRight, Clock } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

export function MarketCard({ market, featured = false }: { market: MarketSummary; featured?: boolean }) {
  const ends = market.endDate ? new Date(market.endDate) : null;
  const days = ends ? Math.max(0, Math.round((ends.getTime() - Date.now()) / 86400000)) : null;
  const { t } = useT();

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
            <span className="mt-1 inline-block pill-accent text-[10px]">{market.aiTag}</span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-yes">
          {t("card.yes", { pct: `${Math.round(market.yesProb * 100)}%` })}
        </span>
        <span className="font-medium text-no">
          {t("card.no", { pct: `${Math.round((1 - market.yesProb) * 100)}%` })}
        </span>
      </div>
      <ProbabilityBar yesProb={market.yesProb} size="sm" />

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
