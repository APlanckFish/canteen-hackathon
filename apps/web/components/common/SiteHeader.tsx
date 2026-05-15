"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Sparkles, History } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dict";
import { LangSwitcher } from "./LangSwitcher";

const NAV: { href: string; key: DictKey }[] = [
  { href: "/", key: "nav.markets" },
  { href: "/portfolio", key: "nav.portfolio" },
  { href: "/about", key: "nav.about" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <header className="sticky top-0 z-30 w-full">
      <div className="absolute inset-0 -z-10 backdrop-blur-md bg-background/40 border-b border-border" />
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-yes shadow-neon">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-semibold tracking-tight">
              Canteen <span className="text-accent">Insight</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm transition-colors",
                    active
                      ? "text-white bg-white/5"
                      : "text-foreground-muted hover:text-white hover:bg-white/5",
                  )}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/portfolio"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-white transition-colors"
          >
            <History className="h-4 w-4" />
            {t("nav.history")}
          </Link>
          <LangSwitcher />
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
        </div>
      </div>
    </header>
  );
}
