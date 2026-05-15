"use client";

import { SiteHeader } from "@/components/common/SiteHeader";
import { SiteFooter } from "@/components/common/SiteFooter";
import { useHistoryStore } from "@/stores/history-store";
import Link from "next/link";
import { History, Trash2, ShieldCheck, ExternalLink } from "lucide-react";
import { formatPct, formatUsd, timeAgo } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { TxLink } from "@/components/common/TxLink";

export default function PortfolioPage() {
  const items = useHistoryStore((s) => s.items);
  const clear = useHistoryStore((s) => s.clear);
  const { t } = useT();

  const totalSpent = items.reduce((sum, i) => sum + (i.amountUsdc ?? 0), 0);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-foreground-muted">
              <History className="h-3.5 w-3.5" /> {t("portfolio.tag")}
            </div>
            <h1 className="mt-1 text-3xl font-bold">{t("portfolio.title")}</h1>
            <p className="mt-1 text-sm text-foreground-muted">
              {t("portfolio.subtitle")}
            </p>
          </div>
          {items.length > 0 ? (
            <button
              type="button"
              onClick={clear}
              className="ghost-button text-xs"
            >
              <Trash2 className="h-3 w-3" />
              {t("portfolio.clear")}
            </button>
          ) : null}
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label={t("portfolio.stat.unlocks")} value={`${items.length}`} />
          <Stat
            label={t("portfolio.stat.totalPaid")}
            value={formatUsd(totalSpent)}
          />
          <Stat
            label={t("portfolio.stat.avgConfidence")}
            value={
              items.length > 0
                ? formatPct(
                    items.reduce((s, i) => s + (i.verdict?.confidence ?? 0), 0) /
                      items.length,
                    0,
                  )
                : "—"
            }
          />
        </div>

        {/* Table */}
        <div className="mt-8 glass-card overflow-hidden">
          {items.length === 0 ? (
            <div className="px-6 py-16 text-center text-foreground-muted text-sm">
              {t("portfolio.empty")}
              <div className="mt-4">
                <Link href="/" className="neon-button">
                  {t("portfolio.exploreCta")}
                </Link>
              </div>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-foreground-dim">
                <tr>
                  <th className="px-4 py-3">{t("portfolio.col.when")}</th>
                  <th className="px-4 py-3">{t("portfolio.col.event")}</th>
                  <th className="px-4 py-3">{t("portfolio.col.verdict")}</th>
                  <th className="px-4 py-3">{t("portfolio.col.paid")}</th>
                  <th className="px-4 py-3">{t("portfolio.col.tx")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.txHash}
                    className="border-t border-border hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3 text-foreground-muted text-xs">
                      {timeAgo(it.unlockedAt)}
                    </td>
                    <td className="px-4 py-3 max-w-[320px]">
                      <Link
                        href={`/event/${encodeURIComponent(it.eventId)}`}
                        className="text-white hover:text-accent line-clamp-2"
                      >
                        {it.question}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {it.verdict ? (
                        <span
                          className={
                            it.verdict.suggestedSide === "YES"
                              ? "pill-yes"
                              : it.verdict.suggestedSide === "NO"
                                ? "pill-no"
                                : "pill-muted"
                          }
                        >
                          {it.verdict.suggestedSide} {formatPct(it.verdict.yesProb, 0)}
                        </span>
                      ) : (
                        <span className="text-foreground-dim">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground-muted">
                      {formatUsd(it.amountUsdc)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground-muted">
                      <TxLink hash={it.txHash} withIcon={false} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/event/${encodeURIComponent(it.eventId)}`}
                        className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-glow"
                      >
                        {t("portfolio.row.open")} <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 inline-flex items-center gap-2 text-xs text-foreground-dim">
          <ShieldCheck className="h-3.5 w-3.5 text-yes" />
          {t("portfolio.note")}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card px-4 py-3">
      <div className="text-xs text-foreground-dim">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
