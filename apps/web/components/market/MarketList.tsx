"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketSummary } from "@canteen/shared/insight";
import { MarketCard } from "./MarketCard";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dict";

const CATEGORIES = [
  "All",
  "Politics",
  "Crypto",
  "Sports",
  "Entertainment",
] as const;
type Category = (typeof CATEGORIES)[number];

interface CategoryPageResponse {
  ok?: boolean;
  items?: MarketSummary[];
  nextPage?: number | null;
}

interface InitialPayload {
  picks: MarketSummary[];
  all: MarketSummary[];
}

interface Props {
  /**
   * Server-rendered initial dataset (picks + first page of "All"). When
   * provided, the first paint shows real cards instead of skeletons.
   */
  initialData?: InitialPayload;
}

export function MarketList({ initialData }: Props) {
  const { t } = useT();

  const [cat, setCat] = useState<Category>("All");
  const [picks] = useState<MarketSummary[]>(initialData?.picks ?? []);

  // Picks live in the carousel — hide them from the grid so users don't see
  // the exact same card twice on the home page.
  const pickIds = useRef<Set<string>>(
    new Set((initialData?.picks ?? []).map((p) => p.id)),
  );

  // Paginated grid state (resets every time `cat` changes)
  const [items, setItems] = useState<MarketSummary[]>(
    (initialData?.all ?? []).filter((m) => !pickIds.current.has(m.id)),
  );
  const [nextPage, setNextPage] = useState<number | null>(
    (initialData?.all?.length ?? 0) > 0 ? 1 : 0,
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Prevent overlapping requests when the user scrolls fast.
  const inFlight = useRef(false);

  /** Fetch a single page for the current category. */
  const fetchPage = useCallback(
    async (category: Category, page: number, opts: { append: boolean }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      try {
        const url = new URL("/api/markets/hot", window.location.origin);
        if (category !== "All") {
          url.searchParams.set("cat", category.toLowerCase());
        }
        url.searchParams.set("page", String(page));
        const r = await fetch(url.toString(), { cache: "no-store" });
        const json = (await r.json()) as CategoryPageResponse;
        // Drop any event that's already shown in the AI Picks rail —
        // only meaningful for the "All" tab (where picks were sourced from
        // the same /events feed). For other tabs `pickIds` is irrelevant
        // but still safe to filter against.
        const newItems = (json.items ?? []).filter(
          (m) => !pickIds.current.has(m.id),
        );
        setItems((prev) => (opts.append ? [...prev, ...newItems] : newItems));
        setNextPage(json.nextPage ?? null);
      } catch (e) {
        console.warn("[markets] fetchPage failed:", e);
        if (!opts.append) setItems([]);
        setNextPage(null);
      } finally {
        inFlight.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  /** When the active category changes, reset list and refetch page 0. */
  useEffect(() => {
    // Skip the very first effect run for "All" if we already have SSR data.
    if (cat === "All" && initialData?.all && initialData.all.length > 0) {
      return;
    }
    void fetchPage(cat, 0, { append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  /** IntersectionObserver sentinel for infinite scroll. */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || nextPage === null) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore && !loading) {
          void fetchPage(cat, nextPage, { append: true });
        }
      },
      { rootMargin: "300px" }, // start loading a bit before the user hits bottom
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cat, nextPage, loadingMore, loading, fetchPage]);

  return (
    <div className="space-y-10">
      {/* ── AI Picks rail ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-accent to-yes">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            {t("markets.aiPicked")}
            <span className="text-xs text-foreground-dim font-normal">
              {t("markets.refresh")}
            </span>
          </h2>
        </div>
        <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2 scrollbar-none snap-x">
          {(picks.length === 0 ? Array.from({ length: 5 }) : picks).map(
            (m, i) => (
              <div key={i} className="min-w-[280px] max-w-[300px] snap-start">
                {m ? (
                  <MarketCard market={m as MarketSummary} featured />
                ) : (
                  <div className="h-44 animate-pulse rounded-2xl border border-border bg-background-card/40" />
                )}
              </div>
            ),
          )}
        </div>
      </section>

      {/* ── Category filter + grid ────────────────────────────────────── */}
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
          {/* Initial-load skeletons: only show when no items AND loading. */}
          {loading && items.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={`s-${i}`}
                  className="h-44 animate-pulse rounded-2xl border border-border bg-background-card/40"
                />
              ))
            : items.map((m) => <MarketCard key={m.id} market={m} />)}

          {/* Empty state */}
          {!loading && items.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-foreground-muted">
              {cat === "All"
                ? t("markets.empty")
                : t("markets.emptyCategory", {
                    category: t(`markets.cat.${cat}` as DictKey),
                  })}
            </div>
          ) : null}
        </div>

        {/* ── Infinite-scroll footer ────────────────────────────────── */}
        {items.length > 0 ? (
          <div className="flex items-center justify-center pt-2 text-xs text-foreground-dim">
            {nextPage !== null ? (
              <div
                ref={sentinelRef}
                className="inline-flex items-center gap-2 py-3"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{t("markets.loadingMore")}</span>
                  </>
                ) : (
                  <span className="opacity-60">{t("markets.loadingMore")}</span>
                )}
              </div>
            ) : (
              <span className="py-3 opacity-60">{t("markets.noMore")}</span>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
