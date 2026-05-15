"use client";

import { useT } from "@/lib/i18n/provider";
import { LOCALES, type Locale } from "@/lib/i18n/dict";
import { cn } from "@/lib/utils";

const FLAG: Record<Locale, string> = { en: "EN", zh: "中" };

export function LangSwitcher() {
  const { locale, setLocale } = useT();
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-background-elevated/40 p-0.5 text-xs">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          className={cn(
            "px-2 py-1 rounded-md transition-colors",
            locale === l
              ? "bg-white/10 text-white"
              : "text-foreground-muted hover:text-white",
          )}
          aria-pressed={locale === l}
        >
          {FLAG[l]}
        </button>
      ))}
    </div>
  );
}
