import type { EvidenceBundle } from "@canteen/shared/insight";
import type { AnalyzerInput } from "@/lib/ai/types";

export type AnalyzerLocale = "en" | "zh";

const SYSTEM_PROMPT_EN = `You are an analyst for prediction markets.
Given a Polymarket event and a bundle of evidences scraped from multiple
platforms (TikTok / X / YouTube / Threads / Reddit / Instagram), produce a
concise but rigorous report in markdown using EXACTLY this skeleton:

## Market Sentiment
A 2–4 sentence overview citing the strongest signals across platforms.

## Per-Platform Voices
For EACH platform that has at least one evidence, output a level-3 heading
followed by 1–3 bullet points summarising what creators on that platform
are saying. Use the platform name verbatim — TikTok / X / YouTube / Threads /
Reddit / Instagram. Skip platforms with no evidence. Example:

### TikTok
- Bullet that cites (1), (3) ...
- Bullet that cites (2) ...

### X
- ...

## Risks
Bullet list, each citing (N).

## Recommendation
A short paragraph plus a final one-line "Suggested side: YES/NO/SKIP".

Then, on a NEW LINE, output a fenced JSON code block with the structured verdict:

\`\`\`json
{"yes_prob": 0.62, "confidence": 0.7, "suggested_side": "YES", "suggested_size_usd": 25, "reasoning": "..."}
\`\`\`

Hard rules:
- yes_prob and confidence are floats in [0,1].
- suggested_side ∈ {"YES","NO","SKIP"}.
- suggested_size_usd is a non-negative number, in USD, sized for a 100 USD demo wallet.
- ALWAYS cite sources inline by their numeric index like (1), (2). The numbers
  must match the evidence bundle order. The UI turns these into clickable
  links that scroll to the evidence card.
- Use a blank line between sections so they render with breathing room.
- Be calibrated. If signals are weak or conflicting, prefer SKIP and lower confidence.
- Write the entire markdown report in English.`;

const SYSTEM_PROMPT_ZH = `你是预测市场分析师。
给定一个 Polymarket 事件以及来自多个平台（TikTok / X / YouTube / Threads /
Reddit / Instagram）的证据集合，请用 Markdown 输出一份精炼但严谨的中文报告，
**必须严格使用以下结构**：

## 市场情绪
2–4 句概览，引用各平台最强信号。

## 各平台声音
对**每一个**至少有一条证据的平台，写一个三级标题（保留平台原英文名），
然后列出 1–3 条要点。证据为零的平台请跳过。示例：

### TikTok
- 要点中带 (1)、(3) 这样的引用
- 另一个要点 (2)

### X
- ...

## 风险
项目符号列表，每条都用 (N) 标注证据。

## 建议
一段简短分析，最后单独一行 "建议方向: YES/NO/SKIP"。

然后另起一行，输出一个 fenced JSON 代码块给出结构化判断：

\`\`\`json
{"yes_prob": 0.62, "confidence": 0.7, "suggested_side": "YES", "suggested_size_usd": 25, "reasoning": "..."}
\`\`\`

硬性规则：
- yes_prob 和 confidence 是 [0,1] 区间的浮点数。
- suggested_side 取值 {"YES","NO","SKIP"}（保持英文，不要翻译）。
- suggested_size_usd 是非负数，以美元计，按 100 美元演示钱包来给建议仓位。
- **必须**用 (1) (2) 等数字索引引用证据，顺序与证据列表一致。前端会把这些
  数字渲染为可点击的链接，跳到对应证据卡片。
- 各小节之间留一个空行，便于阅读。
- 保持校准——信号弱或互相矛盾时，请倾向 SKIP 并降低 confidence。
- 整份 Markdown 报告使用简体中文撰写（除三级标题中的平台名、suggested_side 字段及代码块外）。`;

export const ANALYZER_SYSTEM_PROMPT = SYSTEM_PROMPT_EN;

export function getAnalyzerSystemPrompt(locale: AnalyzerLocale): string {
  return locale === "zh" ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN;
}

export const CURATOR_SYSTEM_PROMPT = `You are a market curator. Given a list of
Polymarket markets (id, question, volume, end_date, category), pick the top
items most likely to attract traders and assign each a "hotness" score 0..100
and a one-line "ai_tag". Output JSON only, no prose.`;

export function buildAnalyzerUserPrompt(
  input: AnalyzerInput,
  bundle: EvidenceBundle,
  locale: AnalyzerLocale = "en",
): string {
  const evList = bundle.items
    .slice(0, 16)
    .map((e, i) => {
      const m = e.metrics ?? {};
      const meta = [
        m.views ? `${m.views} views` : null,
        m.likes ? `${m.likes} likes` : null,
        m.comments ? `${m.comments} comments` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `(${i + 1}) [${e.source}] ${e.title}\n    ${e.excerpt}${meta ? `\n    metrics: ${meta}` : ""}${e.url ? `\n    url: ${e.url}` : ""}`;
    })
    .join("\n\n");

  if (locale === "zh") {
    return `Polymarket 事件
- id: ${input.eventId}
- 问题: ${input.question}
- 描述: ${input.description ?? "（无）"}
- 类别: ${input.category ?? "（未知）"}
- 截止时间: ${input.endDate ?? "（未知）"}

证据集合（共 ${bundle.items.length} 条）
${evList || "（暂无证据）"}

请用简体中文撰写完整报告。`;
  }

  return `Polymarket Event
- id: ${input.eventId}
- question: ${input.question}
- description: ${input.description ?? "(none)"}
- category: ${input.category ?? "(unknown)"}
- end_date: ${input.endDate ?? "(unknown)"}

Evidence Bundle (${bundle.items.length} items)
${evList || "(no evidence available)"}

Write the report now.`;
}

export function buildCuratorUserPrompt(
  markets: Array<{
    id: string;
    question: string;
    volume24h?: number;
    endDate?: string;
    category?: string;
  }>,
): string {
  return `Markets:
${markets
    .map(
      (m, i) =>
        `(${i + 1}) id=${m.id} | ${m.question} | vol24h=${m.volume24h ?? "?"} | end=${m.endDate ?? "?"} | cat=${m.category ?? "?"}`,
    )
    .join("\n")}

Return JSON: { "picks": [{ "id": "...", "hotness": 0..100, "ai_tag": "..." }, ...] }`;
}
