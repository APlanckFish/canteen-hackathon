/**
 * Lightweight i18n dictionaries. Keys are dotted paths.
 *
 * Interpolation: use `{name}` placeholders, resolved by `t(key, vars)`.
 * Brand names (Polymarket, TikHub, DeepSeek, USDC, x402, Arc, Polygon, etc.)
 * stay untranslated by design.
 */

export const en = {
  // ---- meta / global ----
  "meta.title": "Canteen Insight · AI × x402 × Polymarket",
  "meta.description":
    "Pay micro USDC on Arc Testnet to unlock AI-driven Polymarket insights, powered by TikHub multi-source intelligence and DeepSeek reasoning.",

  // ---- nav / footer ----
  "nav.markets": "Markets",
  "nav.portfolio": "Portfolio",
  "nav.about": "How it works",
  "nav.history": "History",
  "footer.network": "Arc Testnet",
  "footer.vault": "Vault {addr}",
  "lang.en": "EN",
  "lang.zh": "中",

  // ---- home ----
  "home.pill": "Canteen × Circle Hackathon",
  "home.heroPre": "Trade prediction markets with",
  "home.heroAccent": "onchain AI insight",
  "home.heroDesc":
    "Pay {price} USDC on Arc Testnet via x402, unlock a deep-research report fused from TikHub multi-source intelligence and DeepSeek reasoning, then trade directly on Polymarket.",
  "home.feature.x402": "x402 micro-payments",
  "home.feature.curated": "AI-curated hot markets",
  "home.feature.receipt": "Onchain receipt",
  "home.stat.markets": "Markets monitored",
  "home.stat.latency": "Avg analysis latency",
  "home.stat.price": "Insight price",
  "home.stat.priceValue": "{price} USDC",

  // ---- markets list ----
  "markets.aiPicked": "AI Picked",
  "markets.refresh": "· refreshed every 60 min",
  "markets.loading": "loading",
  "markets.empty": "No markets returned right now — Polymarket may be cooling down. Try again in a moment.",
  "markets.emptyCategory": "No hot markets in {category} right now. Try another tab or check back in a minute.",
  "markets.loadingMore": "Loading more…",
  "markets.noMore": "You've reached the end.",
  "markets.cat.All": "All",
  "markets.cat.Politics": "Politics",
  "markets.cat.Crypto": "Crypto",
  "markets.cat.Sports": "Sports",
  "markets.cat.Entertainment": "Entertainment",
  "markets.cat.General": "General",

  // ---- market card / pills ----
  "card.yes": "YES {pct}",
  "card.no": "NO {pct}",
  "card.volume24h": "{value} 24h vol",
  "card.daysLeft": "{n}d",
  "card.aiInsight": "AI Insight",
  "card.moreOutcomes": "+{n} more",

  // ---- event detail ----
  "event.back": "Back to markets",
  "event.resolves": "Resolves {date}",
  "event.volume24h": "24h volume",
  "event.liquidity": "liquidity",
  "event.onchainBadge": "Onchain via x402 on Arc",
  "event.unlockTitle": "Unlock AI Insight",
  "event.unlockDesc":
    "One-time payment per event. Streamed AI report + multi-source evidence.",
  "event.tradeTitle": "Trade",
  "event.outcomes.title": "Pick an outcome",
  "event.outcomes.hint": "Each candidate is its own YES/NO market. Pick one to drive the price and trade.",
  "event.fallbackQuestion": "Polymarket event {id}",
  "event.fallbackDesc":
    "Live market data unavailable — running in offline preview mode. The x402 + AI flow remains fully functional.",

  // ---- unlock button ----
  "unlock.idle": "Unlock AI Insight",
  "unlock.preparing": "Preparing…",
  "unlock.approving": "Approving USDC…",
  "unlock.paying": "Awaiting payment signature…",
  "unlock.confirming": "Confirming on-chain…",
  "unlock.streaming": "AI is analyzing…",
  "unlock.done": "Re-run analysis",
  "unlock.error": "Retry",
  "unlock.connect": "Connect wallet to unlock",
  "unlock.cta": "Unlock AI Insight · {price} USDC",
  "unlock.subtle": "Pay via x402 on Arc Testnet · One charge per event",
  "unlock.tx": "tx",

  // ---- insight report ----
  "report.stage.idle": "Awaiting payment",
  "report.stage.validating_payment": "Verifying x402 payment on Arc",
  "report.stage.planning": "Planning multi-source queries",
  "report.stage.fetching_evidence":
    "Aggregating TikHub multi-source intelligence",
  "report.stage.analyzing": "DeepSeek reasoning",
  "report.stage.finalizing": "Finalizing report",
  "report.empty": "Pay {price} USDC on Arc Testnet to unlock the AI insight report.",
  "report.kpi.yesProb": "AI YES Prob",
  "report.kpi.confidence": "Confidence",
  "report.kpi.side": "Suggested Side",
  "report.kpi.size": "Suggested Size",
  "report.live": "Live AI Report",
  "report.streamingHint": "Streaming will start after the payment is confirmed…",
  "report.tx": "tx",
  "report.generated": "generated at {time}",

  // ---- evidence panel ----
  "evidence.empty": "TikHub evidence will appear here once the analysis starts.",
  "evidence.title": "Evidence · {n} sources",
  "evidence.tab.all": "All",
  "evidence.metric.views": "views",
  "evidence.metric.likes": "likes",
  "evidence.metric.comments": "comments",

  // ---- portfolio ----
  "portfolio.tag": "Portfolio",
  "portfolio.title": "Your AI insight history",
  "portfolio.subtitle":
    "All x402 unlock receipts are stored locally. Tap a row to revisit the report.",
  "portfolio.clear": "Clear local history",
  "portfolio.stat.unlocks": "Unlocks",
  "portfolio.stat.totalPaid": "Total paid",
  "portfolio.stat.avgConfidence": "Avg AI confidence",
  "portfolio.empty":
    "No unlocks yet. Browse the markets and unlock your first AI insight.",
  "portfolio.exploreCta": "Explore markets",
  "portfolio.col.when": "When",
  "portfolio.col.event": "Event",
  "portfolio.col.verdict": "Verdict",
  "portfolio.col.paid": "Paid",
  "portfolio.col.tx": "Tx",
  "portfolio.row.open": "Open",
  "portfolio.note": "History is persisted only in your browser via localStorage.",

  // ---- about ----
  "about.pill": "How it works",
  "about.title": "One x402 charge unlocks a full deep-research dossier.",
  "about.subtitle":
    "Canteen Insight is built for the Canteen × Circle hackathon. It demonstrates an end-to-end onchain micro-payment flow on Arc Testnet, coupled with multi-source AI intelligence and a real path to trade execution on Polymarket.",
  "about.step.prefix": "Step {n}",
  "about.step1.title": "Connect wallet",
  "about.step1.desc":
    "Plug in any wallet. We support Arc Testnet for payments and Polygon for trading.",
  "about.step2.title": "Pay {price} USDC",
  "about.step2.desc":
    "An x402 challenge is signed onchain by your wallet, recorded by the PaymentVault.",
  "about.step3.title": "AI report streams",
  "about.step3.desc":
    "TikHub aggregates evidence across TikTok / X / YouTube / Google News in parallel; DeepSeek reasons over them and ships a calibrated YES/NO verdict.",
  "about.step4.title": "Trade on Polymarket V2",
  "about.step4.desc":
    "We auto-detect your funding wallet (Safe / Proxy / Deposit), derive an API key with one EIP-712 signature, then place a $1-min FAK market order via clob-client-v2.",
  "about.tech": "Tech stack",
  "about.cta": "Try the demo",

  // ---- trade button ----
  "trade.connectFirst": "Connect a wallet first",
  "trade.cta": "Trade {side} {size} on Polymarket",
  "trade.ready": "Connected to Polygon · ready to sign",
  "trade.willSwitch": "Will switch wallet to Polygon Mainnet",
  "trade.openOnPolymarket": "Open on Polymarket",
  "trade.notTradeable":
    "Live CLOB unavailable for this market — secondary link will open polymarket.com.",
  "trade.signedHkgRelay":
    "Order is signed in your wallet, relayed via HKG → Polymarket CLOB.",

  // ---- trade dialog ----
  "td.title": "Place order on Polymarket",
  "td.amount.label": "Amount (USD)",
  "td.amount.aiSuggest": "AI suggests {value}",
  "td.amount.shareEstimate": "≈ {shares} {side} shares @ ${price}",
  "td.amount.min": "min ${min}",
  "td.row.usdce": "USDC.e balance",
  "td.row.pol": "POL (gas)",
  "td.row.approvals": "Approvals",
  "td.approvals.ready": "ready",
  "td.approvals.pending": "pending",
  "td.approvals.needSetup": "needs setup",
  "td.cta.switchChain": "Switch wallet to Polygon",
  "td.cta.switching": "Switching network…",
  "td.cta.setApprovals": "Set approvals (one-time)",
  "td.cta.approving": "Approving…",
  "td.cta.placeOrder": "Place {side} order · {size}",
  "td.cta.authing": "Authorizing API key…",
  "td.cta.signing": "Sign order in wallet…",
  "td.cta.submitting": "Submitting to Polymarket…",
  "td.cta.done": "Order placed",
  "td.done.submitted": "Submitted to Polymarket CLOB",
  "td.done.orderId": "Order id: {id}",
  "td.done.viewOnPolymarket": "View on Polymarket",
  "td.footer": "Order is signed locally and relayed via Vercel HKG → Polymarket CLOB.",
  "td.err.noTokenId": "This market has no CLOB token id (not tradeable).",
  "td.err.tooSmall": "Order too small: ${value} < min ${min}.",
  "td.err.noBalance": "Insufficient USDC.e balance.",
  "td.err.noGas": "Need a tiny bit of POL for gas — bridge or top up.",
  "td.err.notApproved":
    "Approvals not set — place one trade on polymarket.com first.",
  "td.err.notEnoughPusd":
    "Not enough pUSD in deposit wallet — fund it on polymarket.com.",
  "td.err.noDepositWallet": "Polymarket deposit wallet not detected.",
  "td.err.detectingWallet": "Wallet type detection still in progress…",
  "td.err.marketTypeUnresolved": "Market type not resolved yet",
  "td.err.authFailed": "Auth failed: {msg}",
  "td.err.signFailed": "Sign failed: {msg}",
  "td.err.submitFailed": "Submit failed: {msg}",

  // ---- trade dialog · setup stepper ----
  "td.setup.title": "Polymarket Setup",
  "td.step.account.title": "Polymarket account ready",
  "td.step.lookingUp": "Looking up…",
  "td.step.notFoundPre": "Not found. Open ",
  "td.step.notFoundPost": " with this wallet first.",
  "td.step.depositPre": "Deposit pUSD on ",
  "td.step.depositPost":
    " — approvals are auto-set during your first deposit.",
  "td.step.ready.title": "Ready to trade",
  "td.step.completeFirst": "Complete step 1 first…",
  "td.step.completeAbove": "Complete step 1 above",
  "td.label.cash": "Cash",
  "td.label.gas": "Gas",
  "td.creds.cached": "API key cached locally.",
  "td.creds.derive":
    "On first trade, your wallet will ask for one extra signature (one-time, no gas) to derive a CLOB API key.",
  "td.needPusd": "Need ${need} but only have ${have}",
  "td.walletKind.detecting": "detecting…",
  "td.walletKind.safe": "Safe",
  "td.walletKind.proxy": "Proxy",
  "td.walletKind.deposit": "Deposit",
  "td.walletKind.unknown": "Unknown",
  "td.close": "Close",

  // ---- about (faucet help) ----
  "about.faucet.title": "Need test USDC on Arc?",
  "about.faucet.desc":
    "Grab free USDC from Circle's official testnet faucet — pick \"Arc Sepolia\" and paste your wallet address.",
  "about.faucet.cta": "Open Circle Faucet",
  "about.faucet.note":
    "Up to 10 USDC per request. You also need a tiny bit of native gas — request that on the same page.",

  // ---- demo mode badge ----
  "demo.badge": "DEMO MODE",
  "demo.fallback": "Stub fallback active: {legs}",
  "demo.leg.evidence": "evidence",
  "demo.leg.analysis": "analysis",
  "demo.detail.noKey":
    "TIKHUB_API_KEY / DEEPSEEK_API_KEY not configured — analysis is rendered from a deterministic stub.",
} as const;

export type DictKey = keyof typeof en;

export const zh: Record<DictKey, string> = {
  // meta
  "meta.title": "Canteen Insight · AI × x402 × Polymarket",
  "meta.description":
    "在 Arc 测试网用微额 USDC 解锁 AI 驱动的 Polymarket 决策洞察，由 TikHub 多源情报与 DeepSeek 推理共同支持。",

  // nav / footer
  "nav.markets": "市场",
  "nav.portfolio": "我的解锁",
  "nav.about": "工作原理",
  "nav.history": "历史",
  "footer.network": "Arc 测试网",
  "footer.vault": "金库 {addr}",
  "lang.en": "EN",
  "lang.zh": "中",

  // home
  "home.pill": "Canteen × Circle 黑客松",
  "home.heroPre": "用",
  "home.heroAccent": "链上 AI 洞察",
  "home.heroDesc":
    "在 Arc 测试网通过 x402 支付 {price} USDC，立即解锁融合 TikHub 多源情报与 DeepSeek 推理的深度报告，再一键直跳 Polymarket 下单。",
  "home.feature.x402": "x402 微额支付",
  "home.feature.curated": "AI 筛选热点市场",
  "home.feature.receipt": "链上收据可查",
  "home.stat.markets": "监控中的市场",
  "home.stat.latency": "平均分析耗时",
  "home.stat.price": "解锁价格",
  "home.stat.priceValue": "{price} USDC",

  // markets list
  "markets.aiPicked": "AI 精选",
  "markets.refresh": "· 60 分钟自动刷新",
  "markets.loading": "加载中",
  "markets.empty": "当前没有可用的市场数据，Polymarket 可能正在冷却，稍后重试。",
  "markets.emptyCategory": "当前「{category}」板块没有热门市场，换个标签或稍后再来。",
  "markets.loadingMore": "加载更多中…",
  "markets.noMore": "已经到底啦",
  "markets.cat.All": "全部",
  "markets.cat.Politics": "政治",
  "markets.cat.Crypto": "加密",
  "markets.cat.Sports": "体育",
  "markets.cat.Entertainment": "娱乐",
  "markets.cat.General": "通用",

  // market card
  "card.yes": "YES {pct}",
  "card.no": "NO {pct}",
  "card.volume24h": "24h 量 {value}",
  "card.daysLeft": "{n}天",
  "card.aiInsight": "AI 洞察",
  "card.moreOutcomes": "还有 {n} 个",

  // event detail
  "event.back": "返回市场",
  "event.resolves": "结算时间 {date}",
  "event.volume24h": "24 小时成交额",
  "event.liquidity": "流动性",
  "event.onchainBadge": "Arc 链上 x402 支付",
  "event.unlockTitle": "解锁 AI 洞察",
  "event.unlockDesc": "每个事件单次付费，流式 AI 报告 + 多源证据汇总。",
  "event.tradeTitle": "交易",
  "event.outcomes.title": "选择候选",
  "event.outcomes.hint": "每个候选都是独立的 YES/NO 市场，选中后会驱动上方价格和下方下单。",
  "event.fallbackQuestion": "Polymarket 事件 {id}",
  "event.fallbackDesc":
    "暂时无法获取实时市场数据，已切换到离线预览模式。x402 + AI 流程仍然可用。",

  // unlock button
  "unlock.idle": "解锁 AI 洞察",
  "unlock.preparing": "准备中…",
  "unlock.approving": "授权 USDC…",
  "unlock.paying": "等待签名支付…",
  "unlock.confirming": "等待链上确认…",
  "unlock.streaming": "AI 分析中…",
  "unlock.done": "重新运行分析",
  "unlock.error": "重试",
  "unlock.connect": "连接钱包以解锁",
  "unlock.cta": "解锁 AI 洞察 · {price} USDC",
  "unlock.subtle": "通过 Arc 测试网上的 x402 支付 · 每事件仅收一次费用",
  "unlock.tx": "交易",

  // report
  "report.stage.idle": "等待支付",
  "report.stage.validating_payment": "校验 Arc 链上的 x402 支付",
  "report.stage.planning": "规划多源查询",
  "report.stage.fetching_evidence": "聚合 TikHub 多源情报",
  "report.stage.analyzing": "DeepSeek 推理中",
  "report.stage.finalizing": "汇总最终报告",
  "report.empty": "在 Arc 测试网支付 {price} USDC 即可解锁 AI 洞察报告。",
  "report.kpi.yesProb": "AI YES 概率",
  "report.kpi.confidence": "置信度",
  "report.kpi.side": "建议方向",
  "report.kpi.size": "建议仓位",
  "report.live": "实时 AI 报告",
  "report.streamingHint": "支付确认后将开始流式输出…",
  "report.tx": "交易",
  "report.generated": "生成时间 {time}",

  // evidence
  "evidence.empty": "分析开始后，TikHub 证据将在此展示。",
  "evidence.title": "证据 · {n} 个来源",
  "evidence.tab.all": "全部",
  "evidence.metric.views": "播放",
  "evidence.metric.likes": "点赞",
  "evidence.metric.comments": "评论",

  // portfolio
  "portfolio.tag": "我的解锁",
  "portfolio.title": "你的 AI 洞察历史",
  "portfolio.subtitle":
    "所有 x402 解锁收据均保存在本地浏览器中，点击行即可重新查看报告。",
  "portfolio.clear": "清空本地历史",
  "portfolio.stat.unlocks": "解锁次数",
  "portfolio.stat.totalPaid": "累计支付",
  "portfolio.stat.avgConfidence": "AI 平均置信度",
  "portfolio.empty": "还没有解锁记录，去市场页面试试你的第一份 AI 洞察吧。",
  "portfolio.exploreCta": "浏览市场",
  "portfolio.col.when": "时间",
  "portfolio.col.event": "事件",
  "portfolio.col.verdict": "结论",
  "portfolio.col.paid": "支付",
  "portfolio.col.tx": "交易",
  "portfolio.row.open": "查看",
  "portfolio.note": "历史记录仅持久化在你的浏览器 localStorage 中。",

  // about
  "about.pill": "工作原理",
  "about.title": "一次 x402 微额支付，换一份完整深度报告。",
  "about.subtitle":
    "Canteen Insight 为 Canteen × Circle 黑客松而构建：在 Arc 测试网完成端到端的链上微额支付闭环，结合多源 AI 情报与到 Polymarket 的真实下单链路。",
  "about.step.prefix": "第 {n} 步",
  "about.step1.title": "连接钱包",
  "about.step1.desc":
    "支持任意钱包。Arc 测试网用于支付，Polygon 用于真实下单。",
  "about.step2.title": "支付 {price} USDC",
  "about.step2.desc":
    "由钱包对 x402 challenge 进行链上签名，PaymentVault 合约负责记录。",
  "about.step3.title": "AI 报告流式输出",
  "about.step3.desc":
    "TikHub 并行聚合 TikTok / X / YouTube / Google News 四源证据，DeepSeek 基于证据推理并给出校准过的 YES/NO 投注建议。",
  "about.step4.title": "在 Polymarket V2 下单",
  "about.step4.desc":
    "自动探测你的 funding wallet（Safe / Proxy / Deposit），用一次 EIP-712 签名派出 API key，再通过 clob-client-v2 下 $1 起的 FAK 市价单。",
  "about.tech": "技术栈",
  "about.cta": "立即体验",

  // trade
  "trade.connectFirst": "请先连接钱包",
  "trade.cta": "在 Polymarket 下 {side} {size}",
  "trade.ready": "已连接 Polygon · 可签名下单",
  "trade.willSwitch": "将切换钱包到 Polygon 主网",
  "trade.openOnPolymarket": "在 Polymarket 打开",
  "trade.notTradeable":
    "此市场暂不支持站内 CLOB 下单，下方按钮会跳转到 polymarket.com。",
  "trade.signedHkgRelay":
    "订单在你的钱包内签名，通过香港节点中继到 Polymarket CLOB。",

  // trade dialog
  "td.title": "在 Polymarket 下单",
  "td.amount.label": "金额（USD）",
  "td.amount.aiSuggest": "AI 建议 {value}",
  "td.amount.shareEstimate": "≈ {shares} 份 {side} @ ${price}",
  "td.amount.min": "最低 ${min}",
  "td.row.usdce": "USDC.e 余额",
  "td.row.pol": "POL（gas）",
  "td.row.approvals": "授权状态",
  "td.approvals.ready": "已授权",
  "td.approvals.pending": "等待中",
  "td.approvals.needSetup": "需要授权",
  "td.cta.switchChain": "切换钱包到 Polygon",
  "td.cta.switching": "切换网络中…",
  "td.cta.setApprovals": "首次授权（一次性）",
  "td.cta.approving": "授权中…",
  "td.cta.placeOrder": "下 {side} 单 · {size}",
  "td.cta.authing": "派生 API 凭据…",
  "td.cta.signing": "请在钱包内签名…",
  "td.cta.submitting": "提交到 Polymarket…",
  "td.cta.done": "订单已提交",
  "td.done.submitted": "已提交到 Polymarket CLOB",
  "td.done.orderId": "订单 id：{id}",
  "td.done.viewOnPolymarket": "在 Polymarket 查看",
  "td.footer": "订单在本地钱包签名，通过 Vercel 香港节点中继到 Polymarket CLOB。",
  "td.err.noTokenId": "此市场没有 CLOB token id，不支持下单。",
  "td.err.tooSmall": "下单金额过小：${value} 低于最低 ${min}。",
  "td.err.noBalance": "USDC.e 余额不足。",
  "td.err.noGas": "钱包需要一点 POL 用作 gas，请桥进或充值。",
  "td.err.notApproved": "尚未完成授权 — 请先在 polymarket.com 完成一次下单。",
  "td.err.notEnoughPusd": "Deposit wallet pUSD 余额不足，请到 polymarket.com 充值。",
  "td.err.noDepositWallet": "未检测到 Polymarket deposit wallet。",
  "td.err.detectingWallet": "正在检测钱包类型…",
  "td.err.marketTypeUnresolved": "市场类型尚未解析",
  "td.err.authFailed": "鉴权失败：{msg}",
  "td.err.signFailed": "签名失败：{msg}",
  "td.err.submitFailed": "提交失败：{msg}",

  // trade dialog · setup stepper
  "td.setup.title": "Polymarket 准备",
  "td.step.account.title": "Polymarket 账户已就绪",
  "td.step.lookingUp": "查询中…",
  "td.step.notFoundPre": "未找到。请先用此钱包打开 ",
  "td.step.notFoundPost": " 完成注册。",
  "td.step.depositPre": "请到 ",
  "td.step.depositPost":
    " 充值 pUSD —— 首次充值时会自动配置链上授权。",
  "td.step.ready.title": "可以下单",
  "td.step.completeFirst": "请先完成第 1 步…",
  "td.step.completeAbove": "请完成上方步骤",
  "td.label.cash": "余额",
  "td.label.gas": "Gas",
  "td.creds.cached": "API key 已缓存到本地。",
  "td.creds.derive":
    "首次下单时，钱包会要求一次额外签名（一次性、免 gas）派出 CLOB API key。",
  "td.needPusd": "需要 ${need}，但只有 ${have}",
  "td.walletKind.detecting": "检测中…",
  "td.walletKind.safe": "Safe",
  "td.walletKind.proxy": "Proxy",
  "td.walletKind.deposit": "Deposit",
  "td.walletKind.unknown": "未知",
  "td.close": "关闭",

  // about (faucet help)
  "about.faucet.title": "需要 Arc 测试网 USDC？",
  "about.faucet.desc":
    "通过 Circle 官方测试网水龙头免费领取 USDC——选择 \"Arc Sepolia\" 并粘贴你的钱包地址即可。",
  "about.faucet.cta": "打开 Circle 水龙头",
  "about.faucet.note":
    "每次最多 10 USDC，同一页面还能领取一点原生 gas。",

  // demo badge
  "demo.badge": "演示模式",
  "demo.fallback": "已启用兜底数据：{legs}",
  "demo.leg.evidence": "证据",
  "demo.leg.analysis": "推理",
  "demo.detail.noKey":
    "TIKHUB_API_KEY / DEEPSEEK_API_KEY 未配置——当前分析由内置 stub 生成。",
};

export const dictionaries = { en, zh } as const;
export type Locale = keyof typeof dictionaries;
export const LOCALES: Locale[] = ["en", "zh"];
export const DEFAULT_LOCALE: Locale = "en";
