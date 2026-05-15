"use client";

import { publicEnv } from "@/lib/env";
import { shortAddress } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { buildArcAddressUrl } from "@/lib/chains";
import { ExternalLink } from "lucide-react";

export function SiteFooter() {
  const { t } = useT();
  const vaultAddr = publicEnv.NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS;
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-foreground-dim">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-yes shadow-[0_0_8px_rgba(61,216,132,0.7)]" />
          {t("footer.network")}
          <span className="opacity-50">·</span>
          {vaultAddr ? (
            <a
              href={buildArcAddressUrl(vaultAddr)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono transition-colors hover:text-accent"
              title={vaultAddr}
            >
              {t("footer.vault", { addr: shortAddress(vaultAddr) })}
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>
          ) : (
            <span className="font-mono">
              {t("footer.vault", { addr: "—" })}
            </span>
          )}
        </div>
        <div className="font-mono">x402 v1 · DeepSeek · TikHub · Polymarket</div>
      </div>
    </footer>
  );
}
