/**
 * Domain types for AI insight pipeline.
 */

export type EvidenceSource =
  | "tiktok"
  | "twitter"
  | "youtube"
  | "threads"
  | "reddit"
  | "instagram"
  | "google_news"
  | "polymarket";

export interface EvidenceItem {
  source: EvidenceSource;
  /** Original platform post / video / article id. */
  id: string;
  title: string;
  /** Plain-text excerpt fed into the model. */
  excerpt: string;
  url?: string;
  author?: string;
  metrics?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
  publishedAt?: number;
}

export interface EvidenceBundle {
  eventId: string;
  query: string;
  fetchedAt: number;
  items: EvidenceItem[];
}

export interface InsightVerdict {
  yesProb: number;
  confidence: number;
  suggestedSide: "YES" | "NO" | "SKIP";
  suggestedSizeUsd: number;
  reasoning: string;
}

export interface InsightReport {
  eventId: string;
  txHash: `0x${string}`;
  generatedAt: number;
  /** Streaming markdown body. */
  summary: string;
  verdict: InsightVerdict;
  evidences: EvidenceItem[];
  /** Provenance of the evidence + reasoning legs. Optional for back-compat. */
  sourceMeta?: InsightSourceMeta;
}

/**
 * Indicates whether each leg of the analysis pipeline ran against real APIs
 * or fell back to a deterministic stub. Streamed back to the client so the UI
 * can show a "DEMO MODE" badge when real keys are missing or upstream errors
 * forced a graceful degradation.
 */
export interface InsightSourceMeta {
  /** TikHub source — true if real evidence came back from the API. */
  evidence: "live" | "stub";
  /** DeepSeek source — true if streaming reasoning came from the model. */
  analysis: "live" | "stub";
  /** Optional human-readable reason for the fallback (e.g. "no key", "402"). */
  reason?: string;
}

/**
 * SSE event payloads emitted by /api/insight/[eventId].
 */
export type InsightStreamEvent =
  | { type: "status"; stage: InsightStage; message?: string }
  | { type: "meta"; meta: InsightSourceMeta }
  | { type: "evidence"; bundle: EvidenceBundle }
  | { type: "delta"; text: string }
  | { type: "verdict"; verdict: InsightVerdict }
  | { type: "done"; report: InsightReport }
  | { type: "error"; code: string; message: string };

export type InsightStage =
  | "validating_payment"
  | "planning"
  | "fetching_evidence"
  | "analyzing"
  | "finalizing";

export interface MarketSummary {
  id: string;
  slug: string;
  question: string;
  description?: string;
  imageUrl?: string;
  yesProb: number;
  volume24h: number;
  liquidity: number;
  endDate?: string;
  category?: string;
  /** AI-assigned hotness 0..100, only present for AI-picked markets. */
  hotness?: number;
  aiTag?: string;
  /**
   * Polymarket CLOB token ids — one per outcome (YES/NO).
   * Required for placing real orders on Polymarket.
   * Returned by Gamma `/markets` as a JSON-encoded string array.
   */
  clobTokenIds?: { yes: string; no: string };
  /** Smallest price increment, e.g. 0.01 = 1¢. Polymarket default 0.01. */
  tickSize?: number;
  /** Smallest order size in USDC. Polymarket default ~5 USDC for taker, 1 USDC for maker. */
  minOrderSize?: number;
  /** Whether market uses NegRisk (multi-outcome) — affects Exchange contract addr. */
  negRisk?: boolean;
  /**
   * For multi-outcome (negRisk) events, the candidate inner markets ranked
   * by YES probability. Each entry carries its own CLOB token ids so the
   * user can place a real trade on whichever candidate they pick.
   *
   * Empty / undefined for plain binary YES/NO markets — the UI falls back
   * to the standard YES%/NO% layout in that case.
   */
  outcomes?: {
    /** Inner market id (used as a stable key + for `fetchMarketById`). */
    id: string;
    /** Stripped candidate name, e.g. "Colorado Avalanche". */
    label: string;
    /** Full inner-market question, e.g. "Will the Colorado Avalanche win…?". */
    question: string;
    prob: number;
    /** Per-candidate trade params (each candidate is its own YES/NO pair). */
    clobTokenIds?: { yes: string; no: string };
    tickSize?: number;
    minOrderSize?: number;
    negRisk?: boolean;
  }[];
}
