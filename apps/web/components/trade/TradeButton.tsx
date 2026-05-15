"use client";

import { useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { polygonMainnet } from "@/lib/chains";
import { placeOrder, buildPolymarketDeepLink, type TradeSide } from "@/lib/polymarket/clob";
import type { MarketSummary, InsightVerdict } from "@canteen/shared/insight";
import { ExternalLink, Loader2, ArrowRightLeft } from "lucide-react";
import { cn, formatUsd } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

interface Props {
  market: MarketSummary;
  verdict?: InsightVerdict;
  className?: string;
}

export function TradeButton({ market, verdict, className }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useT();

  const onPolygon = chainId === polygonMainnet.id;
  const side: TradeSide = verdict?.suggestedSide === "NO" ? "NO" : "YES";
  const size = Math.max(1, Math.round(verdict?.suggestedSizeUsd ?? 25));

  const onClick = async () => {
    setError(null);
    if (!address) {
      setError(t("trade.connectFirst"));
      return;
    }
    setBusy(true);
    try {
      if (!onPolygon) {
        await switchChainAsync({ chainId: polygonMainnet.id });
      }
      const result = await placeOrder({
        market,
        side,
        sizeUsd: size,
        signer: address,
      });
      if (result.ok && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else if (result.error) {
        setError(result.error);
      }
    } catch (e) {
      // If switching chain failed, just open deep link directly so the demo flow
      // never dead-ends.
      const url = buildPolymarketDeepLink(market, side);
      window.open(url, "_blank", "noopener,noreferrer");
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={cn(
          "group inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-6 text-sm font-semibold transition-all",
          side === "YES"
            ? "border-yes/40 bg-yes-soft text-yes hover:bg-yes/20 hover:shadow-neon-yes"
            : "border-no/40 bg-no-soft text-no hover:bg-no/20 hover:shadow-neon-no",
          busy && "cursor-progress opacity-70",
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
        <span>{t("trade.cta", { side, size: formatUsd(size) })}</span>
        <ExternalLink className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100" />
      </button>
      <div className="text-xs text-foreground-muted">
        {onPolygon ? t("trade.ready") : t("trade.willSwitch")}
      </div>
      {error ? <div className="text-xs text-no">{error}</div> : null}
    </div>
  );
}
