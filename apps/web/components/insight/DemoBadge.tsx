"use client";

import { Beaker, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { InsightSourceMeta } from "@canteen/shared/insight";

interface Props {
  /** Live / stub provenance. If absent we treat both legs as unknown (no badge). */
  meta?: InsightSourceMeta;
  /** When true, render even if meta is undefined (used for pre-unlock pages). */
  forceDemo?: boolean;
  /** Optional reason string surfaced when meta is missing but env says no key. */
  inferredReason?: string;
  className?: string;
}

/**
 * DemoBadge surfaces the "this run used stubbed data" signal.
 * - Both legs live → no badge
 * - Either leg stub → yellow "DEMO MODE" pill with tooltip
 */
export function DemoBadge({ meta, forceDemo, inferredReason, className }: Props) {
  const { t } = useT();

  const isDemo = forceDemo
    ? true
    : meta
      ? meta.evidence === "stub" || meta.analysis === "stub"
      : false;

  if (!isDemo) return null;

  let detail: string;
  if (meta) {
    const parts: string[] = [];
    if (meta.evidence === "stub") parts.push(t("demo.leg.evidence"));
    if (meta.analysis === "stub") parts.push(t("demo.leg.analysis"));
    detail = t("demo.fallback", { legs: parts.join(" + ") || "—" });
    if (meta.reason) detail += ` — ${meta.reason}`;
  } else {
    detail = inferredReason ?? t("demo.detail.noKey");
  }

  return (
    <div
      className={cn(
        "group relative inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[11px] font-medium text-warn",
        className,
      )}
      title={detail}
    >
      <Beaker className="h-3 w-3" />
      <span>{t("demo.badge")}</span>
      <Info className="h-3 w-3 opacity-60" />
      {/* Hover tooltip */}
      <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-background-elevated px-3 py-2 text-[11px] text-foreground-muted shadow-xl group-hover:block">
        {detail}
      </div>
    </div>
  );
}
