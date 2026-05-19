"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, type Locale as RkLocale } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState } from "react";
import { wagmiConfig } from "@/lib/wagmi";
import { I18nProvider, useT } from "@/lib/i18n/provider";

/**
 * Map our app-level locale (`en` / `zh`) → the locale string that
 * RainbowKit's i18n layer understands. Keeping this in sync means the
 * wallet modal labels (Connect Wallet / Get a Wallet / etc.) follow
 * whatever the user picks in our top-right language switcher.
 */
function appLocaleToRkLocale(l: "en" | "zh"): RkLocale {
  return l === "zh" ? "zh-CN" : "en-US";
}

/** Inner provider that reads the i18n context and forwards `locale` to RainbowKit. */
function RainbowKitWithLocale({ children }: { children: React.ReactNode }) {
  const { locale } = useT();
  return (
    <RainbowKitProvider
      locale={appLocaleToRkLocale(locale)}
      theme={darkTheme({
        accentColor: "#2D9CDB",
        accentColorForeground: "white",
        borderRadius: "medium",
        overlayBlur: "small",
      })}
      modalSize="compact"
    >
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <I18nProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitWithLocale>{children}</RainbowKitWithLocale>
        </QueryClientProvider>
      </WagmiProvider>
    </I18nProvider>
  );
}
