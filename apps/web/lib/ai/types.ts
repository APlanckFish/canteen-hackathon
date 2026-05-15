import type {
  EvidenceBundle,
  InsightStreamEvent,
  InsightVerdict,
  InsightReport,
} from "@canteen/shared/insight";

export type StreamEmitter = (e: InsightStreamEvent) => void;

export interface AnalyzerInput {
  eventId: string;
  txHash: `0x${string}`;
  question: string;
  description?: string;
  category?: string;
  endDate?: string;
  /** "en" | "zh" — drives DeepSeek prompt language and stub fallback. */
  locale?: "en" | "zh";
}

export interface AnalyzerResult {
  bundle: EvidenceBundle;
  verdict: InsightVerdict;
  summary: string;
  report: InsightReport;
}
