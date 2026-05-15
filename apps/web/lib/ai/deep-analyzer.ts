import type {
  EvidenceBundle,
  EvidenceItem,
  InsightReport,
  InsightSourceMeta,
  InsightVerdict,
} from "@canteen/shared/insight";
import type { AnalyzerInput, AnalyzerResult, StreamEmitter } from "./types";
import { aggregateEvidence } from "@/lib/tikhub/aggregator";
import { runDeepseekAnalysis } from "@/lib/deepseek/client";
import {
  buildAnalyzerUserPrompt,
  getAnalyzerSystemPrompt,
} from "@/lib/deepseek/prompts";
import { integrations } from "@/lib/env";

/**
 * Deep-analyzer agent: TikHub multi-source aggregation + DeepSeek streaming reasoning.
 *
 * Both legs gracefully fall back to a deterministic stub on:
 *  - missing API key
 *  - upstream HTTP error (4xx / 5xx)
 *  - empty result set / quota exhausted
 *  - parse failures
 *
 * The pipeline emits a `meta` SSE event so the UI can show a "DEMO MODE" badge
 * when either leg degraded.
 */
export async function runDeepAnalyzer(
  input: AnalyzerInput,
  emit: StreamEmitter,
): Promise<AnalyzerResult> {
  const locale = input.locale ?? "en";

  emit({
    type: "status",
    stage: "fetching_evidence",
    message:
      locale === "zh"
        ? "正在拉取 TikHub 多源情报"
        : "Querying TikHub multi-source intelligence",
  });

  const aggregate = await aggregateEvidence({
    eventId: input.eventId,
    query: input.question,
    category: input.category,
  });
  emit({ type: "evidence", bundle: aggregate.bundle });

  emit({
    type: "status",
    stage: "analyzing",
    message:
      locale === "zh"
        ? "DeepSeek 推理中"
        : "DeepSeek reasoning over evidences",
  });

  const summaryChunks: string[] = [];
  let verdict: InsightVerdict | undefined;
  let analysisOutcome: "live" | "stub" = "stub";
  let analysisReason: string | undefined;

  if (integrations.hasDeepseek) {
    try {
      const stream = runDeepseekAnalysis({
        system: getAnalyzerSystemPrompt(locale),
        user: buildAnalyzerUserPrompt(input, aggregate.bundle, locale),
      });
      for await (const chunk of stream) {
        if (chunk.type === "delta") {
          summaryChunks.push(chunk.text);
          emit({ type: "delta", text: chunk.text });
        } else if (chunk.type === "verdict") {
          verdict = chunk.verdict;
          emit({ type: "verdict", verdict });
        }
      }
      // If the stream ended but produced no text, treat as upstream issue.
      if (summaryChunks.length === 0) {
        analysisReason = "DeepSeek returned empty stream";
      } else {
        analysisOutcome = "live";
      }
    } catch (e) {
      analysisReason = e instanceof Error ? e.message : String(e);
      // Reset partial chunks — we'll replace them with a clean stub.
      summaryChunks.length = 0;
      verdict = undefined;
    }
  } else {
    analysisReason = "DEEPSEEK_API_KEY not configured";
  }

  // Stub fallback if real call didn't produce content.
  if (analysisOutcome !== "live") {
    const text = stubReport(aggregate.bundle, locale);
    for (const piece of text.match(/[\s\S]{1,32}/g) ?? []) {
      summaryChunks.push(piece);
      emit({ type: "delta", text: piece });
      await new Promise((r) => setTimeout(r, 25));
    }
    if (!verdict) {
      verdict = stubVerdict(locale);
      emit({ type: "verdict", verdict });
    }
  }

  if (!verdict) {
    verdict = stubVerdict(locale);
    emit({ type: "verdict", verdict });
  }

  // Compose meta and emit before `done` so clients can react before completion.
  const sourceMeta: InsightSourceMeta = {
    evidence: aggregate.outcome,
    analysis: analysisOutcome,
    reason: [aggregate.reason, analysisReason].filter(Boolean).join(" · ") || undefined,
  };
  emit({ type: "meta", meta: sourceMeta });

  const summary = summaryChunks.join("");
  const report: InsightReport = {
    eventId: input.eventId,
    txHash: input.txHash,
    generatedAt: Math.floor(Date.now() / 1000),
    summary,
    verdict,
    evidences: aggregate.bundle.items,
    sourceMeta,
  };

  emit({ type: "status", stage: "finalizing" });
  emit({ type: "done", report });

  return { bundle: aggregate.bundle, verdict, summary, report };
}

function stubReport(bundle: EvidenceBundle, locale: "en" | "zh"): string {
  // Group evidences by platform so the stub looks like the prompt's output.
  const byPlatform: Record<string, EvidenceItem[]> = {};
  for (const e of bundle.items) {
    (byPlatform[e.source] ??= []).push(e);
  }
  const PLATFORM_LABEL: Record<string, string> = {
    tiktok: "TikTok",
    twitter: "X",
    youtube: "YouTube",
    threads: "Threads",
    reddit: "Reddit",
    instagram: "Instagram",
    google_news: "Google News",
    polymarket: "Polymarket",
  };

  // Build (n) index per evidence so the citations resolve in the UI.
  const idx = new Map<EvidenceItem, number>();
  bundle.items.forEach((e, i) => idx.set(e, i + 1));

  const platforms = Object.keys(byPlatform);

  if (locale === "zh") {
    const platformBlocks = platforms
      .map((p) => {
        const list = byPlatform[p];
        const lines = list
          .slice(0, 3)
          .map((e) => `- ${truncateLine(e.title, 90)} (${idx.get(e)})`)
          .join("\n");
        return `### ${PLATFORM_LABEL[p] ?? p}\n${lines}`;
      })
      .join("\n\n");

    return [
      `## 市场情绪\n`,
      `综合 **${bundle.items.length}** 条证据（覆盖 ${platforms.length} 个平台），公众注意力偏向温和看多。多个平台的创作者将其定调为关键节点 (1)，部分声音更强调执行风险 (2)。\n\n`,
      `## 各平台声音\n\n`,
      platformBlocks,
      `\n\n## 风险\n`,
      `- 结算条件可能由临近截止日的单一事件决定 (3)。\n- 临近截止日流动性可能变薄，价差扩大。\n- 突发声明带来的尾部风险。\n\n`,
      `## 建议\n`,
      `偏向 YES，仓位适中。聚合信号偏建设性但并不压倒性，建议分批建仓。\n\n建议方向: YES\n`,
    ].join("");
  }

  const platformBlocks = platforms
    .map((p) => {
      const list = byPlatform[p];
      const lines = list
        .slice(0, 3)
        .map((e) => `- ${truncateLine(e.title, 90)} (${idx.get(e)})`)
        .join("\n");
      return `### ${PLATFORM_LABEL[p] ?? p}\n${lines}`;
    })
    .join("\n\n");

  return [
    `## Market Sentiment\n`,
    `Across **${bundle.items.length}** evidence pieces spanning ${platforms.length} platforms, public attention skews moderately bullish. Creators frame this as a watershed moment (1), while some voices emphasize execution risk (2).\n\n`,
    `## Per-Platform Voices\n\n`,
    platformBlocks,
    `\n\n## Risks\n`,
    `- Resolution can hinge on a single event before settlement (3).\n- Liquidity may thin as deadline approaches; expect spread widening.\n- Tail risk from unexpected announcements.\n\n`,
    `## Recommendation\n`,
    `Lean YES with a modest size. The aggregated signal is constructive but not overwhelming — consider scaling in.\n\nSuggested side: YES\n`,
  ].join("");
}

function truncateLine(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function stubVerdict(locale: "en" | "zh"): InsightVerdict {
  return {
    yesProb: 0.62,
    confidence: 0.7,
    suggestedSide: "YES",
    suggestedSizeUsd: 25,
    reasoning:
      locale === "zh"
        ? "演示用 stub 结论 — 配置 DEEPSEEK_API_KEY 与 TIKHUB_API_KEY 可启用真实分析。"
        : "Demo stub verdict — connect DEEPSEEK_API_KEY and TIKHUB_API_KEY for real analysis.",
  };
}

export type { EvidenceItem };
