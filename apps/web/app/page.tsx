"use client";

import { SiteHeader } from "@/components/common/SiteHeader";
import { SiteFooter } from "@/components/common/SiteFooter";
import { MarketList } from "@/components/market/MarketList";
import { Sparkles, Zap, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { publicEnv } from "@/lib/env";

export default function HomePage() {
  const { t } = useT();
  const price = publicEnv.NEXT_PUBLIC_INSIGHT_PRICE_USDC;
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 -z-10 bg-radial-glow" />
          <div className="absolute inset-0 -z-10 grid-bg opacity-40" />
          <div className="mx-auto max-w-7xl px-6 py-14 lg:py-20">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl space-y-4">
                <span className="pill-accent">
                  <Sparkles className="h-3 w-3" /> {t("home.pill")}
                </span>
                <h1 className="text-4xl lg:text-5xl font-bold leading-tight text-balance">
                  {t("home.heroPre")}{" "}
                  <span className="bg-gradient-to-r from-accent to-yes bg-clip-text text-transparent">
                    {t("home.heroAccent")}
                  </span>
                  .
                </h1>
                <p className="text-foreground-muted text-base lg:text-lg leading-relaxed">
                  {t("home.heroDesc", { price })}
                </p>
                <div className="flex flex-wrap gap-3 text-xs text-foreground-muted">
                  <span className="pill-muted">
                    <Zap className="h-3 w-3" /> {t("home.feature.x402")}
                  </span>
                  <span className="pill-muted">
                    <Sparkles className="h-3 w-3" /> {t("home.feature.curated")}
                  </span>
                  <span className="pill-muted">
                    <ShieldCheck className="h-3 w-3" /> {t("home.feature.receipt")}
                  </span>
                </div>
              </div>
              <StatStrip />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-10">
          <MarketList />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function StatStrip() {
  const { t } = useT();
  const price = publicEnv.NEXT_PUBLIC_INSIGHT_PRICE_USDC;
  const stats = [
    { label: t("home.stat.markets"), value: "320+" },
    { label: t("home.stat.latency"), value: "~28s" },
    { label: t("home.stat.price"), value: t("home.stat.priceValue", { price }) },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 lg:gap-4 min-w-[320px]">
      {stats.map((s) => (
        <div key={s.label} className="glass-card px-4 py-3 text-center">
          <div className="text-xs text-foreground-dim">{s.label}</div>
          <div className="mt-1 text-base font-semibold text-white">{s.value}</div>
        </div>
      ))}
    </div>
  );
}
