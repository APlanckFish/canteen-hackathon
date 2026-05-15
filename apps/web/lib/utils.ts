import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Truncate an EVM address to e.g. `0x1234…abcd`. */
export function shortAddress(addr?: string, chars = 4): string {
  if (!addr) return "";
  if (addr.length < chars * 2 + 4) return addr;
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export function shortHash(hash?: string, head = 6, tail = 4): string {
  if (!hash) return "";
  if (hash.length < head + tail + 4) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function formatUsd(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && Math.abs(n) >= 1_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatPct(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`;
}

/** Convert a decimal USDC amount (e.g. 0.5) to base units (USDC has 6 decimals). */
export function usdcToBaseUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

export function baseUnitsToUsdc(amount: bigint): number {
  return Number(amount) / 1_000_000;
}

/** Format unix seconds → human relative time (very small implementation). */
export function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
