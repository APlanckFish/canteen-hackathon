/**
 * Off-chain ledger writer that records each x402 payment so the operator can
 * later top up the TikHub apikey balance manually (or programmatically once a
 * topup API is available).
 *
 * Designed as a pluggable interface — when a real settler is wired (TRC20
 * transfer, automation script, etc), only this module needs to change.
 */
import { getKv, KV_KEYS } from "@/lib/kv";

export interface LedgerEntry {
  txHash: `0x${string}`;
  payer: `0x${string}`;
  eventId: `0x${string}`;
  amount: string; // base units
  chainId: number;
  blockNumber: string;
  recordedAt: number;
  /** Whether the operator has reflected this payment in TikHub balance. */
  settled: boolean;
}

export async function recordLedger(entry: Omit<LedgerEntry, "settled" | "recordedAt">) {
  const kv = getKv();
  const full: LedgerEntry = {
    ...entry,
    recordedAt: Math.floor(Date.now() / 1000),
    settled: false,
  };
  await kv.set(KV_KEYS.ledger(entry.txHash), JSON.stringify(full));
  return full;
}

export async function getLedger(txHash: string): Promise<LedgerEntry | null> {
  const kv = getKv();
  const raw = await kv.get<string>(KV_KEYS.ledger(txHash));
  return raw ? (JSON.parse(raw) as LedgerEntry) : null;
}
