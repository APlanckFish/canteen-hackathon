"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketSummary } from "@canteen/shared/insight";
import { MarketCard } from "./MarketCard";
import { Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dict";

const CATEGORIES = ["All", "Politics", "Crypto", "Sports", "Entertainment"] as const;
// AI rankings are cached server-side for 1 hour, so polling more often
// than that would just hit a stale KV entry. Refresh hourly + on tab
// re-focus, which is what users actually care about.
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

interface ApiResponse {
  ok?: boolean;
  picks: MarketSummary[];
  all: MarketSummary[];
}

interface Props {
  /**
   * Server-rendered initial dataset. When provided, the component renders
   * cards immediately (no skeleton flash) and starts the 60s refresh loop
   * in the background.
   */
  initialData?: { picks: MarketSummary[]; all: MarketSummary[] };
}

export function MarketList({ initialData }: Props) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [data, setData] = useState<ApiResponse | null>(
    initialData ?? null,
  );
  // Only show the skeleton on the very first load when we have no SSR
  // payload. Subsequent silent refreshes never flip this to true.
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useT();

  // Keep a ref so the interval callback always sees the latest visibility
  // state without re-creating the timer.
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh(initial = false) {
      if (inFlight.current) return;
      // Don't burn API quota when the tab isn't visible.
      if (
        !initial &&
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      inFlight.current = true;
      if (!initial) setRefreshing(true);
      try {
        const res = await fetch("/api/markets/hot", { cache: "no-store" });
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        console.warn("[markets] refresh failed:", e);
      } finally {
        inFlight.current = false;
        if (!cancelled) {
          setRefreshing(false);
          if (initial) setLoading(false);
        }
      }
    }

    // If we don't have SSR data, kick off an immediate fetch; otherwise
    // just start the polling loop.
    if (!initialData) void refresh(true);

    const id = window.setInterval(() => void refresh(false), REFRESH_INTERVAL_MS);

    // Refresh once when the tab regains focus — don't make users stare
    // at stale data.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(false);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picks = data?.picks ?? [];
  const all = (data?.all ?? []).filter((m) => {
    if (cat === "All") return true;
    // Match against the inferred category in lib/polymarket/gamma.ts.
    // Use case-insensitive equality + a fallback substring check so that
    // upstream variations like "U.S. Politics" still hit the "Politics" tab.
    const c = (m.category ?? "").toLowerCase();
    const target = cat.toLowerCase();
    return c === target || c.includes(target);
  });

  return (
    <div className="space-y-10">
      {/* AI Picks rail */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-accent to-yes">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            {t("markets.aiPicked")}
            <span className="text-xs text-foreground-dim font-normal flex items-center gap-1">
              {t("markets.refresh")}
              {refreshing ? (
                <RefreshCw className="h-3 w-3 animate-spin text-accent" />
              ) : null}
            </span>
          </h2>
        </div>
        <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2 scrollbar-none snap-x">
          {(loading ? Array.from({ length: 5 }) : picks).map((m, i) => (
            <div key={i} className="min-w-[280px] max-w-[300px] snap-start">
              {m ? (
                <MarketCard market={m as MarketSummary} featured />
              ) : (
                <div className="h-44 animate-pulse rounded-2xl border border-border bg-background-card/40" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Filters */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors border",
                cat === c
                  ? "bg-white/10 text-white border-white/20"
                  : "text-foreground-muted border-border hover:text-white hover:border-white/20",
              )}
            >
              {t(`markets.cat.${c}` as DictKey)}
            </button>
          ))}
          {loading ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-foreground-dim">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {t("markets.loading")}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(loading ? Array.from({ length: 8 }) : all).map((m, i) =>
            m ? (
              <MarketCard key={(m as MarketSummary).id} market={m as MarketSummary} />
            ) : (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl border border-border bg-background-card/40"
              />
            ),
          )}
          {!loading && all.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-foreground-muted">
              {(data?.all?.length ?? 0) === 0
                ? t("markets.empty")
                : t("markets.emptyCategory", {
                    category: t(`markets.cat.${cat}` as DictKey),
                  })}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
