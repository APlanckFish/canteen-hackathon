"use client";

import { create } from "zustand";
import type {
  EvidenceItem,
  InsightReport,
  InsightSourceMeta,
  InsightStage,
  InsightStreamEvent,
  InsightVerdict,
} from "@canteen/shared/insight";

interface InsightSlice {
  stage: InsightStage | "idle";
  message: string;
  summary: string;
  evidences: EvidenceItem[];
  verdict?: InsightVerdict;
  report?: InsightReport;
  sourceMeta?: InsightSourceMeta;
  error?: string;
}

const empty: InsightSlice = {
  stage: "idle",
  message: "",
  summary: "",
  evidences: [],
};

interface State {
  byEvent: Record<string, InsightSlice>;
  apply: (eventId: string, e: InsightStreamEvent) => void;
  reset: (eventId: string) => void;
  /**
   * Restore a slice from a previously-persisted run (e.g. from history-store).
   * Sets stage to "finalizing" and report so the UI renders as "done".
   */
  hydrate: (
    eventId: string,
    data: {
      summary?: string;
      evidences?: EvidenceItem[];
      verdict?: InsightVerdict;
      report?: InsightReport;
      sourceMeta?: InsightSourceMeta;
    },
  ) => void;
}

export const useInsightStore = create<State>((set) => ({
  byEvent: {},
  apply: (eventId, e) =>
    set((s) => {
      const cur = s.byEvent[eventId] ?? empty;
      const next: InsightSlice = { ...cur };
      switch (e.type) {
        case "status":
          next.stage = e.stage;
          next.message = e.message ?? "";
          break;
        case "meta":
          next.sourceMeta = e.meta;
          break;
        case "evidence":
          next.evidences = e.bundle.items;
          break;
        case "delta":
          next.summary = (next.summary ?? "") + e.text;
          break;
        case "verdict":
          next.verdict = e.verdict;
          break;
        case "done":
          next.report = e.report;
          // Preserve sourceMeta from earlier `meta` event; report carries it too.
          next.sourceMeta = e.report.sourceMeta ?? next.sourceMeta;
          next.stage = "finalizing";
          break;
        case "error":
          next.error = `${e.code}: ${e.message}`;
          break;
      }
      return { byEvent: { ...s.byEvent, [eventId]: next } };
    }),
  reset: (eventId) =>
    set((s) => ({ byEvent: { ...s.byEvent, [eventId]: empty } })),
  hydrate: (eventId, data) =>
    set((s) => ({
      byEvent: {
        ...s.byEvent,
        [eventId]: {
          stage: "finalizing",
          message: "",
          summary: data.summary ?? "",
          evidences: data.evidences ?? [],
          verdict: data.verdict,
          report: data.report,
          sourceMeta: data.sourceMeta ?? data.report?.sourceMeta,
        },
      },
    })),
}));
