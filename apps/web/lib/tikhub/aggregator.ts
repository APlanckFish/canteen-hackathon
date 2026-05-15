import type {
  EvidenceBundle,
  EvidenceItem,
  EvidenceSource,
} from "@canteen/shared/insight";
import { fetchTikhubEvidences } from "./client";
import { integrations } from "@/lib/env";

const FALLBACK_SOURCES: EvidenceSource[] = [
  "tiktok",
  "twitter",
  "youtube",
  "threads",
  "reddit",
  "instagram",
];

export type AggregateOutcome = "live" | "stub";

export interface AggregateResult {
  bundle: EvidenceBundle;
  outcome: AggregateOutcome;
  /** Optional one-line reason explaining why we fell back to stub. */
  reason?: string;
}

export async function aggregateEvidence(opts: {
  eventId: string;
  query: string;
  category?: string;
}): Promise<AggregateResult> {
  const stub = (reason?: string): AggregateResult => ({
    bundle: {
      eventId: opts.eventId,
      query: opts.query,
      fetchedAt: Math.floor(Date.now() / 1000),
      items: stubEvidences(opts.query),
    },
    outcome: "stub",
    reason,
  });

  if (!integrations.hasTikhub) {
    return stub("TIKHUB_API_KEY not configured");
  }

  const sources = chooseSources(opts.category);
  let lastError: unknown;
  let allFailed = true;
  const items: EvidenceItem[] = [];
  try {
    const settled = await Promise.allSettled(
      sources.map((src) => fetchTikhubEvidences(src, opts.query, 6)),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") {
        items.push(...r.value);
        if (r.value.length > 0) allFailed = false;
      } else {
        lastError = r.reason;
      }
    }
  } catch (e) {
    lastError = e;
  }

  if (items.length === 0) {
    const msg = allFailed
      ? "TikHub returned no items (rate-limited / quota exhausted / bad key)"
      : (lastError instanceof Error ? lastError.message : "Unknown TikHub error");
    return stub(msg);
  }

  return {
    bundle: {
      eventId: opts.eventId,
      query: opts.query,
      fetchedAt: Math.floor(Date.now() / 1000),
      items,
    },
    outcome: "live",
  };
}

function chooseSources(category?: string): EvidenceSource[] {
  // Always try every source we have an endpoint for; the client itself silently
  // skips 402 (paywall) so unconfigured sources don't pollute logs or UX.
  // Category is reserved for future weighting/ordering — currently unused.
  void category;
  return FALLBACK_SOURCES;
}

function stubEvidences(query: string): EvidenceItem[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      source: "tiktok",
      id: "stub-tt-1",
      title: `Top creator reacts to: ${query}`,
      excerpt:
        "Massive engagement (820k views) — comments lean optimistic on the YES outcome, citing recent momentum.",
      url: "https://www.tiktok.com/",
      author: "@cryptobeats",
      metrics: { views: 820000, likes: 92000, comments: 4500 },
      publishedAt: now - 3600,
    },
    {
      source: "twitter",
      id: "stub-x-1",
      title: `KOL thread: pricing in ${query}`,
      excerpt:
        "8-tweet thread breaking down the resolution criteria; concludes that markets under-price downside risk by ~7%.",
      url: "https://x.com/",
      author: "@onchain_alpha",
      metrics: { views: 230000, likes: 1900, comments: 320, shares: 410 },
      publishedAt: now - 7200,
    },
    {
      source: "youtube",
      id: "stub-yt-1",
      title: `Deep dive video on ${query}`,
      excerpt:
        "23-min explainer covers historical base rates and lays out 3 scenarios; modal scenario is YES with ~58% probability.",
      url: "https://www.youtube.com/",
      author: "Predictions Podcast",
      metrics: { views: 45200, likes: 1400, comments: 220 },
      publishedAt: now - 14400,
    },
    {
      source: "google_news",
      id: "stub-gn-1",
      title: `News roundup: ${query}`,
      excerpt:
        "Two major outlets report a regulatory development materially relevant to settlement; tone is cautiously positive.",
      url: "https://news.google.com/",
      publishedAt: now - 5400,
    },
  ];
}
