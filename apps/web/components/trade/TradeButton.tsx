"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ArrowRightLeft, ExternalLink } from "lucide-react";
import { buildPolymarketDeepLink, type TradeSide } from "@/lib/polymarket/clob";
import { TradeDialog } from "./TradeDialog";
import type { MarketSummary, InsightVerdict } from "@canteen/shared/insight";
import { cn, formatUsd } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

interface Props {
  market: MarketSummary;
  verdict?: InsightVerdict;
  className?: string;
}

/**
 * Two buttons:
 *   1. Primary — "Trade on this site" → opens TradeDialog → real CLOB order.
 *   2. Secondary — "Open on Polymarket" → falls back to deep link, always works.
 *
 * Primary auto-falls back to opening the deep link if the market lacks a
 * `clobTokenIds` slot (some Gamma markets aren't tradeable via CLOB yet).
 */
export function TradeButton({ market, verdict, className }: Props) {
  const { address } = useAccount();
  const { t } = useT();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Default side: AI verdict if explicit, else lean to market majority.
  // Keep this logic identical to TradeDialog's so the button label matches
  // what the dialog will pre-select.
  const aiSide: TradeSide =
    verdict?.suggestedSide === "YES"
      ? "YES"
      : verdict?.suggestedSide === "NO"
        ? "NO"
        : (market.yesProb ?? 0.5) >= 0.5
          ? "YES"
          : "NO";
  const aiSize = Math.max(0.01, verdict?.suggestedSizeUsd ?? 1);
  const tradeable = !!market.clobTokenIds?.yes && !!market.clobTokenIds?.no;

  const onPrimary = () => {
    if (!address) return;
    if (!tradeable) {
      window.open(
        buildPolymarketDeepLink(market, aiSide),
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    setDialogOpen(true);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Primary CTA */}
      <button
        type="button"
        onClick={onPrimary}
        disabled={!address}
        className={cn(
          "group inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-6 text-sm font-semibold transition-all",
          aiSide === "YES"
            ? "border-yes/40 bg-yes-soft text-yes hover:bg-yes/20 hover:shadow-neon-yes"
            : "border-no/40 bg-no-soft text-no hover:bg-no/20 hover:shadow-neon-no",
          !address && "opacity-60 cursor-not-allowed",
        )}
      >
        <ArrowRightLeft className="h-4 w-4" />
        <span>
          {address
            ? t("trade.cta", { side: aiSide, size: formatUsd(aiSize) })
            : t("trade.connectFirst")}
        </span>
      </button>

      {/* Secondary: open on polymarket.com */}
      <a
        href={buildPolymarketDeepLink(market, aiSide)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-1.5 text-xs text-foreground-muted hover:text-white transition-colors"
      >
        {t("trade.openOnPolymarket")}
        <ExternalLink className="h-3 w-3" />
      </a>

      {!tradeable ? (
        <div className="text-[11px] text-foreground-dim text-center">
          {t("trade.notTradeable")}
        </div>
      ) : (
        <div className="text-[11px] text-foreground-dim text-center">
          {t("trade.signedHkgRelay")}
        </div>
      )}

      {dialogOpen ? (
        <TradeDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          market={market}
          verdict={verdict}
        />
      ) : null}
    </div>
  );
}
