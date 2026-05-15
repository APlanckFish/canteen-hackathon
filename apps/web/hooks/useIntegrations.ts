"use client";

import { useEffect, useState } from "react";

interface IntegrationFlags {
  deepseek: boolean;
  tikhub: boolean;
  kv: boolean;
  vault: boolean;
}

const DEFAULTS: IntegrationFlags = {
  deepseek: false,
  tikhub: false,
  kv: false,
  vault: false,
};

let cached: IntegrationFlags | null = null;
let inflight: Promise<IntegrationFlags> | null = null;

async function load(): Promise<IntegrationFlags> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch("/api/integrations", { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => {
      cached = {
        deepseek: !!d.deepseek,
        tikhub: !!d.tikhub,
        kv: !!d.kv,
        vault: !!d.vault,
      };
      return cached;
    })
    .catch(() => DEFAULTS)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Public hook. SSR-safe: returns DEFAULTS on first paint, hydrates after mount. */
export function useIntegrations(): IntegrationFlags {
  const [flags, setFlags] = useState<IntegrationFlags>(cached ?? DEFAULTS);
  useEffect(() => {
    let cancelled = false;
    load().then((f) => {
      if (!cancelled) setFlags(f);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return flags;
}
