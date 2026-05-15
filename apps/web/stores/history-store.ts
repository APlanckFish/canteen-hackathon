"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  EvidenceItem,
  InsightSourceMeta,
  InsightVerdict,
} from "@canteen/shared/insight";

export interface HistoryItem {
  eventId: string;
  question: string;
  txHash: `0x${string}`;
  payer: `0x${string}`;
  amountUsdc: number;
  unlockedAt: number;
  verdict?: InsightVerdict;
  /** Streaming AI report markdown body — kept so we can rehydrate insight-store. */
  summary?: string;
  /** Evidence items captured during the run. */
  evidences?: EvidenceItem[];
  /** "en" | "zh" — language the report was generated in. */
  locale?: "en" | "zh";
  /** Live vs stub provenance, used for the DEMO MODE badge. */
  sourceMeta?: InsightSourceMeta;
}

interface State {
  items: HistoryItem[];
  add: (item: HistoryItem) => void;
  /** Look up the most recent unlock for a given event (any locale). */
  getByEvent: (eventId: string) => HistoryItem | undefined;
  clear: () => void;
}

export const useHistoryStore = create<State>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((s) => ({
          items: [item, ...s.items.filter((x) => x.txHash !== item.txHash)].slice(
            0,
            50,
          ),
        })),
      getByEvent: (eventId) =>
        get().items.find((x) => x.eventId === eventId),
      clear: () => set({ items: [] }),
    }),
    {
      name: "canteen-history-v2",
      version: 2,
      // Migration: v1 → v2 added summary/evidences/locale. We just keep older
      // entries as-is; the rehydrate hook tolerates missing fields.
      migrate: (persisted) => persisted as { items: HistoryItem[] },
    },
  ),
);
