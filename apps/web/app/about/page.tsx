"use client";

import { SiteHeader } from "@/components/common/SiteHeader";
import { SiteFooter } from "@/components/common/SiteFooter";
import Link from "next/link";
import { Wallet, Zap, Sparkles, ArrowRightLeft, Droplets, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { publicEnv } from "@/lib/env";
import type { DictKey } from "@/lib/i18n/dict";

export default function AboutPage() {
  const { t } = useT();
  const price = publicEnv.NEXT_PUBLIC_INSIGHT_PRICE_USDC;

  const steps: { icon: typeof Wallet; titleKey: DictKey; descKey: DictKey }[] = [
    { icon: Wallet, titleKey: "about.step1.title", descKey: "about.step1.desc" },
    { icon: Zap, titleKey: "about.step2.title", descKey: "about.step2.desc" },
    {
      icon: Sparkles,
      titleKey: "about.step3.title",
      descKey: "about.step3.desc",
    },
    {
      icon: ArrowRightLeft,
      titleKey: "about.step4.title",
      descKey: "about.step4.desc",
    },
  ];

  const techStack = [
    "Next.js 14 App Router",
    "TypeScript",
    "Tailwind + shadcn",
    "Zustand",
    "viem",
    "wagmi v2",
    "RainbowKit v2",
    "Solidity 0.8.24",
    "Foundry",
    "OpenZeppelin",
    "DeepSeek",
    "TikHub",
    "Polymarket Gamma",
    "Vercel",
    "Vercel KV",
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <div className="space-y-3 text-center">
          <span className="pill-accent">{t("about.pill")}</span>
          <h1 className="text-4xl font-bold text-balance">{t("about.title")}</h1>
          <p className="mx-auto max-w-2xl text-foreground-muted">
            {t("about.subtitle")}
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="glass-card p-5 space-y-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent to-yes shadow-neon">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[11px] text-foreground-dim">
                    {t("about.step.prefix", { n: i + 1 })}
                  </div>
                  <div className="mt-0.5 text-base font-semibold">
                    {t(s.titleKey, { price })}
                  </div>
                </div>
                <p className="text-sm text-foreground-muted">
                  {t(s.descKey, { price })}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-12 glass-card p-6 space-y-3">
          <div className="text-xs uppercase tracking-wider text-foreground-dim">
            {t("about.tech")}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {techStack.map((s) => (
              <span key={s} className="pill-muted">
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Circle Testnet faucet — helps demo evaluators get Arc USDC. */}
        <div className="mt-6 glass-card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-yes shadow-neon">
              <Droplets className="h-4 w-4" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="text-base font-semibold">
                {t("about.faucet.title")}
              </div>
              <p className="text-sm text-foreground-muted">
                {t("about.faucet.desc")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 transition-colors"
            >
              {t("about.faucet.cta")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <span className="text-xs text-foreground-dim">
              {t("about.faucet.note")}
            </span>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link href="/" className="neon-button">
            {t("about.cta")}
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
