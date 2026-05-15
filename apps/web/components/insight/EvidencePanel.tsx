"use client";

import { useEffect, useMemo, useState } from "react";
import { useInsightStore } from "@/stores/insight-store";
import {
  Music2,
  Twitter,
  Youtube,
  Newspaper,
  ExternalLink,
  AtSign,
  Hash,
  Camera,
} from "lucide-react";
import type {
  EvidenceItem,
  EvidenceSource,
} from "@canteen/shared/insight";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { DemoBadge } from "./DemoBadge";

interface PlatformMeta {
  label: string;
  icon: typeof Music2;
  /** Brand-accurate icon color (used inside the icon chip). */
  iconColor: string;
  /** Subtle border tint applied on hover. */
  hoverBorder: string;
  /** Soft chip background behind the icon. */
  chipBg: string;
  /** Tab pill accent — used when the tab is active OR for the tab label. */
  tabAccent: string;
}

// Brand colors are the actual hex used by each platform's marks. We keep the
// row chrome neutral (zinc) so the colored icon stands out without making the
// whole card look like a candy box.
const PLATFORM: Record<EvidenceSource, PlatformMeta> = {
  tiktok: {
    label: "TikTok",
    icon: Music2,
    // TikTok's primary mark is white-on-black; we use white for clarity on dark UI.
    iconColor: "text-white",
    hoverBorder: "hover:border-white/30",
    chipBg: "bg-black ring-white/15",
    tabAccent: "text-white",
  },
  twitter: {
    label: "X",
    icon: Twitter,
    iconColor: "text-white",
    hoverBorder: "hover:border-white/30",
    chipBg: "bg-black ring-white/15",
    tabAccent: "text-white",
  },
  youtube: {
    label: "YouTube",
    icon: Youtube,
    // YouTube red #FF0000 → tailwind text-red-500 ≈ #ef4444 (close enough).
    iconColor: "text-red-500",
    hoverBorder: "hover:border-red-500/40",
    chipBg: "bg-white/95 ring-white/30",
    tabAccent: "text-red-400",
  },
  threads: {
    label: "Threads",
    icon: AtSign,
    iconColor: "text-white",
    hoverBorder: "hover:border-white/30",
    chipBg: "bg-black ring-white/15",
    tabAccent: "text-white",
  },
  reddit: {
    label: "Reddit",
    icon: Hash,
    // Reddit orange-red #FF4500
    iconColor: "text-white",
    hoverBorder: "hover:border-[#FF4500]/50",
    chipBg: "bg-[#FF4500] ring-[#FF4500]/40",
    tabAccent: "text-[#FF4500]",
  },
  instagram: {
    label: "Instagram",
    icon: Camera,
    // Instagram gradient — we approximate via a fuchsia/orange gradient chip.
    iconColor: "text-white",
    hoverBorder: "hover:border-fuchsia-500/40",
    chipBg:
      "bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-500 ring-fuchsia-500/30",
    tabAccent: "text-fuchsia-400",
  },
  google_news: {
    label: "Google News",
    icon: Newspaper,
    iconColor: "text-emerald-500",
    hoverBorder: "hover:border-emerald-500/40",
    chipBg: "bg-white/95 ring-white/30",
    tabAccent: "text-emerald-400",
  },
  polymarket: {
    label: "Polymarket",
    icon: Newspaper,
    iconColor: "text-accent",
    hoverBorder: "hover:border-accent/40",
    chipBg: "bg-accent/15 ring-accent/30",
    tabAccent: "text-accent",
  },
};

type Tab = "all" | EvidenceSource;

export function EvidencePanel({ eventId }: { eventId: string }) {
  const slice = useInsightStore((s) => s.byEvent[eventId]);
  const items = slice?.evidences ?? [];
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("all");

  // Build a stable global index (1-based) for each evidence so MarkdownView's
  // (N) citations can address them via #evidence-N.
  const indexed = useMemo(
    () => items.map((it, i) => ({ item: it, index: i + 1 })),
    [items],
  );

  // Group + count per platform.
  const grouped = useMemo(() => {
    const m: Partial<Record<EvidenceSource, { item: EvidenceItem; index: number }[]>> = {};
    for (const ent of indexed) {
      (m[ent.item.source] ??= []).push(ent);
    }
    return m;
  }, [indexed]);

  const presentSources = useMemo(
    () =>
      (Object.keys(grouped) as EvidenceSource[]).sort(
        (a, b) => (grouped[b]?.length ?? 0) - (grouped[a]?.length ?? 0),
      ),
    [grouped],
  );

  // When a citation link sets the URL hash to #evidence-N, switch to "all" tab
  // if the current filter would hide that row, so the scroll can land.
  useEffect(() => {
    function handler() {
      const h = window.location.hash;
      const m = /^#evidence-(\d+)$/.exec(h);
      if (!m) return;
      const n = parseInt(m[1], 10);
      const target = indexed[n - 1];
      if (!target) return;
      if (tab !== "all" && tab !== target.item.source) {
        setTab("all");
      }
    }
    window.addEventListener("hashchange", handler);
    // Also run once on mount in case the user landed with a hash already set.
    handler();
    return () => window.removeEventListener("hashchange", handler);
  }, [indexed, tab]);

  if (items.length === 0) {
    return (
      <div className="glass-card p-5 text-sm text-foreground-muted">
        {t("evidence.empty")}
      </div>
    );
  }

  const visible: { item: EvidenceItem; index: number }[] =
    tab === "all"
      ? indexed
      : (grouped[tab as EvidenceSource] ?? []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wider text-foreground-dim">
          {t("evidence.title", { n: items.length })}
        </h3>
        <DemoBadge meta={slice?.sourceMeta} />
      </div>

      {/* Platform tabs */}
      <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
        <TabBtn
          active={tab === "all"}
          onClick={() => setTab("all")}
          label={t("evidence.tab.all")}
          count={items.length}
        />
        {presentSources.map((src) => {
          const meta = PLATFORM[src];
          const Icon = meta.icon;
          return (
            <TabBtn
              key={src}
              active={tab === src}
              onClick={() => setTab(src)}
              label={meta.label}
              count={grouped[src]?.length ?? 0}
              icon={<Icon className={cn("h-3 w-3", meta.tabAccent)} />}
            />
          );
        })}
      </div>

      <div className="space-y-2">
        {visible.map(({ item, index }) => (
          <EvidenceRow key={`${item.source}-${item.id}-${index}`} item={item} index={index} />
        ))}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        active
          ? "border-white/20 bg-white/10 text-white"
          : "border-border bg-background-card/40 text-foreground-muted hover:border-white/20 hover:text-white",
      )}
    >
      {icon}
      <span>{label}</span>
      <span
        className={cn(
          "rounded-md px-1 text-[10px]",
          active ? "bg-white/10 text-white" : "bg-white/5 text-foreground-dim",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EvidenceRow({ item, index }: { item: EvidenceItem; index: number }) {
  const meta = PLATFORM[item.source] ?? PLATFORM.polymarket;
  const Icon = meta.icon;
  const { t } = useT();
  return (
    <a
      id={`evidence-${index}`}
      href={item.url ?? "#"}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "group flex gap-3 rounded-xl border border-border bg-background-card/60 p-3 transition-colors scroll-mt-24",
        meta.hoverBorder,
      )}
    >
      <div
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1",
          meta.chipBg,
        )}
      >
        <Icon className={cn("h-4 w-4", meta.iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-foreground-dim">
          <span className="text-foreground-dim/70">({index})</span>
          <span className={cn("font-semibold", meta.tabAccent)}>
            {meta.label}
          </span>
          {item.author ? <span>· {item.author}</span> : null}
        </div>
        <div className="mt-0.5 line-clamp-2 text-sm text-white">{item.title}</div>
        {item.excerpt && item.excerpt !== item.title ? (
          <div className="mt-1 line-clamp-2 text-xs text-foreground-muted">
            {item.excerpt}
          </div>
        ) : null}
        {item.metrics ? (
          <div className="mt-1.5 flex gap-3 text-[10px] text-foreground-dim">
            {item.metrics.views ? (
              <span>{compact(item.metrics.views)} {t("evidence.metric.views")}</span>
            ) : null}
            {item.metrics.likes ? (
              <span>{compact(item.metrics.likes)} {t("evidence.metric.likes")}</span>
            ) : null}
            {item.metrics.comments ? (
              <span>{compact(item.metrics.comments)} {t("evidence.metric.comments")}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <ExternalLink className="h-3.5 w-3.5 self-start text-foreground-dim opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}
