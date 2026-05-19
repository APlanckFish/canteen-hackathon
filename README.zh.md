# Canteen Insight · AI × x402 × Polymarket

> Canteen × Circle 黑客松参赛作品。
> 一个 Polymarket 风格的 Web App：用户在 **Arc Testnet** 上通过 **x402** 协议支付微量 USDC 解锁 AI 深度研究报告（TikHub 多源情报 + DeepSeek 推理），然后直接在 **Polymarket V2 CLOB（Polygon Mainnet）** 上完成下单。

[![English](https://img.shields.io/badge/lang-English-blue)](./README.md) [![中文](https://img.shields.io/badge/lang-中文-red)](./README.zh.md)

---

## 🚀 在线体验

**Production**: https://canteen-hackthon.vercel.app

**前置准备**（约 3 分钟）：

1. 连接钱包（MetaMask 或 WalletConnect 兼容钱包）
2. 在 [polymarket.com](https://polymarket.com) 用同一个钱包登录注册一次（拿到 funding wallet）
3. 在 polymarket.com 充值至少 $1 pUSD（首次充值会自动配置 on-chain approvals）
4. 钱包里准备：
   - **Arc Testnet**: ≥ 1 USDC + 少量原生 gas（解锁 AI 报告）
   - **Polygon**: ≥ 0.05 POL（gas）
5. 在我们的 App 里随便点一个市场 → `Unlock AI Insight · 0.5 USDC` → 看 AI 报告 → `Trade YES / NO` → 完成下单

---

## ✨ 核心特性

- 🔐 **x402 链上支付** — 0.5 USDC 解锁，链上 `Paid` 事件验证 + KV 双重防重放。
- 🤖 **双 Agent AI 分析** — Topic Curator 选热门市场，Deep Analyzer 写研究报告 + 给出 YES 概率/置信度/建议下注金额。
- 📰 **TikHub 多源情报** — TikTok + X + YouTube + Google News 并发抓取，任何一路挂掉不影响整体。
- 💱 **Polymarket V2 无感下单** — 自动探测钱包类型（EOA/Safe/Proxy/Deposit）、自动派 API key、$1 起的 FAK 市价单，用户**全程不用复制粘贴 API key**。
- 🌐 **HKG Edge 反代** — 绕过 Polymarket CLOB 的 CORS + 美国 IP 屏蔽。
- 🛡️ **失败兜底** — TikHub/DeepSeek/Gamma/CLOB 任何上游故障都有 stub / 缓存 / deep-link 回退路径。

---

## 🏗️ 架构总览

```
Browser (Next.js 14 + wagmi v2 + RainbowKit v2)
   │                                 ▲
   │ POST /api/insight/[id]          │ SSE: status / evidence / delta / verdict
   ▼                                 │
Vercel Edge / Serverless Functions ──┘
   │            │            │              │
   ▼            ▼            ▼              ▼
[Arc Testnet] [TikHub]  [DeepSeek]    [Polymarket]
PaymentVault  多源抓取    流式生成      Gamma + CLOB V2
                                      (Edge HKG 反代)
```

---

## 📂 仓库结构

```
canteen-hackthon/
├── apps/web/                    # Next.js 14 App Router 主应用
│   ├── app/
│   │   ├── api/insight/[id]/    # x402 三段握手 + AI SSE 流
│   │   ├── api/markets/hot/     # Polymarket Gamma 代理 + AI 排序
│   │   └── api/trade/
│   │       ├── clob-proxy/      # CLOB API 反代 (Edge / HKG)
│   │       └── polymarket-profile/  # Funding wallet 查询
│   ├── components/
│   │   ├── insight/             # UnlockButton / InsightReport / EvidencePanel
│   │   └── trade/TradeDialog.tsx  # ⭐ Polymarket V2 下单对话框
│   └── lib/
│       ├── ai/                  # Topic Curator + Deep Analyzer
│       ├── tikhub/              # 多源聚合 + ledger
│       ├── x402/                # 协议实现（client + server）
│       └── polymarket/          # ⭐ V2 CLOB 接入（详见下文）
├── packages/shared/             # 跨包类型 + ABI + 协议常量
├── contracts/                   # Foundry 工作区 - PaymentVault.sol
├── scripts/deploy-vercel.sh     # 一键部署到 Vercel
└── README.md / README.zh.md     # 本文档（英文 / 中文）
```

### Polymarket V2 接入模块（`apps/web/lib/polymarket/`）

| 文件 | 作用 |
|---|---|
| `constants.ts` | V2 合约地址（CTF Exchange V2 / NegRisk V2 / pUSD / CollateralOnramp） |
| `gamma.ts` | Polymarket Gamma API 封装 |
| `clob.ts` | CLOB host / deep-link 构造 |
| `wallet-type.ts` | ⭐ 链上探测钱包类型（EOA/Safe/Proxy/Deposit）→ 决定 sigType |
| `deposit-wallet.ts` | 通过 polymarket.com profile 查询 funding wallet |
| `approvals.ts` | V2 approvals 状态读取（pUSD + V2 Exchange） |
| `onramp.ts` | USDC.e → pUSD 包装（CollateralOnramp.wrap） |
| `viem-signer.ts` | viem WalletClient → SDK ClobSigner 适配器 |

---

## 🛠️ 本地开发

### 前置依赖

- Node.js ≥ 20
- pnpm 9（`corepack enable && corepack prepare pnpm@9.12.0 --activate`）
- Foundry（`curl -L https://foundry.paradigm.xyz | bash && foundryup`）

### 安装与启动

```bash
git clone <repo>
cd canteen-hackthon
pnpm install
cp .env.example .env.local
# 填入 DEEPSEEK_API_KEY / TIKHUB_API_KEY / NEXT_PUBLIC_ARC_* / NEXT_PUBLIC_*_ADDRESS 等

pnpm dev
# 访问 http://localhost:3000
```

> **离线兜底**：没有 `DEEPSEEK_API_KEY` / `TIKHUB_API_KEY` 时，分析器会自动切到 deterministic stub stream，演示流程仍然完整可走。

### 合约部署

```bash
pnpm contracts:test                 # forge test -vv（7 个测试用例）
pnpm contracts:deploy:arc           # 部署到 Arc Testnet
# 把输出的合约地址填到 NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS
```

### 生产构建

```bash
pnpm build
pnpm start
```

---

## ☁️ 部署到 Vercel

### 一键脚本

```bash
./scripts/deploy-vercel.sh --prod
```

脚本会自动：

1. 检查 vercel CLI 是否登录
2. `vercel link` 关联项目（首次）
3. 把 `apps/web/.env.local` 全量同步到 Vercel（production / preview / development 三个环境）
4. `vercel deploy --prod` 推上线

### 手动部署

```bash
pnpm install -g vercel
vercel login
vercel link
# 在 Vercel 面板配置环境变量（参见 .env.example）
vercel deploy --prod
```

### ⚠️ 部署注意事项

1. **Edge Runtime + HKG region 必须保留** —— `/api/trade/clob-proxy/[...path]` 和 `/api/trade/polymarket-profile` 都强制了 `runtime = "edge"` + `preferredRegion = ["hkg1"]`，用于绕过 Polymarket 的美国 IP 屏蔽。**不要改成 Node runtime**，会导致地区屏蔽。

2. **Vercel KV 必须配置** —— 生产环境的 x402 nonce 防重放和 Gamma 缓存依赖 Vercel KV (Upstash Redis)。开发环境会 fallback 到内存 KV，但每次冷启动都会丢，**生产不能这样**。

3. **环境变量同步** —— 修改 `.env.local` 后必须重新跑 `./scripts/deploy-vercel.sh --env-only` 或手动在 Vercel 面板更新。Vercel 不会自动从仓库读取。

4. **WalletConnect Project ID** —— 必须配 `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`，否则手机端扫码登录直接报错。

5. **合约地址跨环境隔离** —— Arc Testnet 上的 `PaymentVault` 部署后地址写到 `NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS`，三个 Vercel 环境（prod/preview/dev）各自配置一份，避免 preview 部署污染生产支付链路。

6. **CLOB API key 不需要服务端配置** —— Polymarket 的 L2 API key 是**用户的钱包派生**的（EIP-712 签名），缓存在浏览器 localStorage，**完全不经过我们的服务端**。这意味着我们没有任何用户私密数据需要保护。

---

## 🔧 环境变量

完整列表见 [`.env.example`](./.env.example)。重点：

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_ARC_CHAIN_ID` / `_ARC_RPC_URL` | Arc Testnet 配置（x402 结算） |
| `NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS` | 已部署的 `PaymentVault` 地址 |
| `NEXT_PUBLIC_USDC_ARC_ADDRESS` | Arc Testnet 上的 USDC ERC20 地址 |
| `NEXT_PUBLIC_INSIGHT_PRICE_USDC` | 单次解锁价格（默认 0.5） |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | RainbowKit / WalletConnect 项目 ID |
| `NEXT_PUBLIC_POLYGON_RPC_URL` | Polygon RPC（建议自备 Alchemy/Quicknode endpoint） |
| `DEEPSEEK_API_KEY` / `_BASE_URL` / `_MODEL` | DeepSeek 流式对话 |
| `TIKHUB_API_KEY` / `_BASE_URL` | TikHub 多源情报 |
| `GAMMA_BASE_URL` | Polymarket Gamma API（默认公开） |
| `KV_REST_API_URL` / `_TOKEN` | Vercel KV (Upstash Redis) |

---

## 🎬 演示流程（5 步，约 3 分钟）

1. **首页 AI Picked 列表** — Polymarket 实时市场，按 AI 热度排序，每分钟刷新。
2. **进入事件详情** — YES / NO 双色 hero、volume / liquidity / category。
3. **点击 `Unlock AI Insight · 0.5 USDC`** —
   - 钱包弹两次：`approve` USDC → `PaymentVault.pay()`
   - 服务端先返 402 → 验证链上 `Paid` log → 开 SSE 流
   - 右侧 evidence panel 实时填入 TikHub 多源 feeds，左侧 markdown 报告流式输出。
4. **看 AI Verdict KPIs** — YES 概率、置信度、建议方向、建议金额。
5. **点击 `Trade YES / NO on Polymarket`** —
   - 钱包自动切到 Polygon
   - 探测 funding wallet → 探测钱包类型 → 自动派 API key → 弹一次 EIP-712 签名 → 下单成功
   - 全程不需要用户复制粘贴 API key

---

## 📦 技术栈

Next.js 14 · TypeScript · Tailwind · shadcn 风格组件 · Zustand
viem · wagmi v2 · RainbowKit v2 · Solidity 0.8.24 · Foundry · OpenZeppelin
DeepSeek (`deepseek-chat`) · TikHub · **Polymarket V2 Gamma + CLOB**（`@polymarket/clob-client-v2`）· Vercel + Vercel KV.

---

## 📜 License

MIT
