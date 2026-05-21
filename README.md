# Canteen Insight · AI × x402 × Polymarket

> Hackathon submission for **Canteen × Circle**.
> A Polymarket-style web app that lets users pay micro USDC on **Arc Testnet via the x402 protocol** to unlock an AI-driven research report (TikHub multi-source intelligence + DeepSeek reasoning), then trade directly on **Polymarket V2 CLOB (Polygon Mainnet)**.

[![English](https://img.shields.io/badge/lang-English-blue)](./README.md) [![中文](https://img.shields.io/badge/lang-中文-red)](./README.zh.md)

---

## 🚀 Live Demo

**Production**: https://canteen-hackthon.vercel.app

**Live Video Demo**: https://www.loom.com/share/128d01e85cdf490f9829f1fdc2e60403

**Pre-flight (about 3 minutes)**:

1. Connect a wallet (MetaMask or any WalletConnect-compatible wallet).
2. Sign in once on [polymarket.com](https://polymarket.com) with the **same wallet** so a funding wallet gets provisioned.
3. Deposit at least $1 pUSD on polymarket.com (the first deposit auto-configures on-chain approvals).
4. Top up the wallet with:
   - **Arc Testnet**: ≥ 1 USDC + a sliver of native gas (to unlock AI reports)
   - **Polygon**: ≥ 0.05 POL (gas only)
5. In our app: pick any market → `Unlock AI Insight · 0.5 USDC` → read the AI report → `Trade YES / NO` → done.

---

## ✨ Highlights

- 🔐 **x402 on-chain payment** — 0.5 USDC unlock, verified by the `Paid` log on-chain plus KV double-replay protection.
- 🤖 **Two-agent AI orchestration** — Topic Curator selects the hottest markets, Deep Analyzer streams a research report with calibrated YES probability, confidence and suggested size.
- 📰 **TikHub multi-source intelligence** — TikTok + X + YouTube + Google News fetched in parallel; any single feed failing doesn't break the bundle.
- 💱 **Polymarket V2 zero-friction trading** — automatic wallet-kind detection (EOA / Safe / Proxy / Deposit), automatic API-key derivation, $1-min FAK market buy. **Users never have to paste an API key.**
- 🌐 **HKG Edge reverse proxy** — bypasses Polymarket CLOB's CORS + US-IP restrictions.
- 🛡️ **Hardened fallbacks** — TikHub / DeepSeek / Gamma / CLOB outages all degrade gracefully via stubs / cache / deep-link.

---

## 🏗️ Architecture

```
Browser (Next.js 14 + wagmi v2 + RainbowKit v2)
   │                                 ▲
   │ POST /api/insight/[id]          │ SSE: status / evidence / delta / verdict
   ▼                                 │
Vercel Edge / Serverless Functions ──┘
   │            │            │              │
   ▼            ▼            ▼              ▼
[Arc Testnet] [TikHub]  [DeepSeek]    [Polymarket]
PaymentVault  multi-fetch  streaming    Gamma + CLOB V2
                                       (Edge HKG proxy)
```

---

## 📂 Repository Layout

```
canteen-hackthon/
├── apps/web/                    # Next.js 14 App Router app
│   ├── app/
│   │   ├── api/insight/[id]/    # x402 3-leg handshake + AI SSE stream
│   │   ├── api/markets/hot/     # Polymarket Gamma proxy + AI ranking
│   │   └── api/trade/
│   │       ├── clob-proxy/      # CLOB API reverse-proxy (Edge / HKG)
│   │       └── polymarket-profile/  # funding-wallet lookup
│   ├── components/
│   │   ├── insight/             # UnlockButton / InsightReport / EvidencePanel
│   │   └── trade/TradeDialog.tsx  # ⭐ Polymarket V2 trade dialog
│   └── lib/
│       ├── ai/                  # Topic Curator + Deep Analyzer
│       ├── tikhub/              # multi-source aggregator + ledger
│       ├── x402/                # protocol implementation
│       └── polymarket/          # ⭐ V2 CLOB integration (see below)
├── packages/shared/             # cross-package types + ABI + protocol consts
├── contracts/                   # Foundry workspace - PaymentVault.sol
├── scripts/deploy-vercel.sh     # one-shot Vercel deploy
└── README.md / README.zh.md     # this file (EN / 中文)
```

### Polymarket V2 modules (`apps/web/lib/polymarket/`)

| File | Purpose |
|---|---|
| `constants.ts` | V2 contract addresses (CTF Exchange V2 / NegRisk V2 / pUSD / CollateralOnramp) |
| `gamma.ts` | Polymarket Gamma API client |
| `clob.ts` | CLOB host + deep-link builder |
| `wallet-type.ts` | ⭐ on-chain wallet-kind probe (EOA / Safe / Proxy / Deposit) → maps to `sigType` |
| `deposit-wallet.ts` | funding-wallet lookup via the polymarket.com profile endpoint |
| `approvals.ts` | V2 approval status (pUSD + V2 Exchange) |
| `onramp.ts` | USDC.e → pUSD wrap helper (`CollateralOnramp.wrap`) |
| `viem-signer.ts` | viem `WalletClient` → SDK `ClobSigner` adapter |

---

## 🛠️ Local Setup

### Prerequisites

- Node.js ≥ 20
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)

### Install & run

```bash
git clone <repo>
cd canteen-hackthon
pnpm install
cp .env.example .env.local
# fill in DEEPSEEK_API_KEY / TIKHUB_API_KEY / NEXT_PUBLIC_ARC_* / NEXT_PUBLIC_*_ADDRESS, etc.

pnpm dev
# open http://localhost:3000
```

> **Offline fallback**: without `DEEPSEEK_API_KEY` / `TIKHUB_API_KEY`, the analyzer switches to a deterministic stub stream so the demo flow always completes end-to-end.

### Contracts

```bash
pnpm contracts:test                 # forge test -vv (7 cases)
pnpm contracts:deploy:arc           # deploy to Arc Testnet
# copy the printed address into NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS
```

### Production build

```bash
pnpm build
pnpm start
```

---

## ☁️ Deploying to Vercel

### One-shot script

```bash
./scripts/deploy-vercel.sh --prod
```

The script will:

1. Verify the vercel CLI is logged in.
2. `vercel link` the project (first time only).
3. Sync every entry in `apps/web/.env.local` to all three Vercel environments (production / preview / development).
4. `vercel deploy --prod` to ship.

### Manual

```bash
pnpm install -g vercel
vercel login
vercel link
# configure env vars in the Vercel dashboard (see .env.example)
vercel deploy --prod
```

### ⚠️ Deployment Caveats

1. **Keep Edge Runtime + HKG region.** Both `/api/trade/clob-proxy/[...path]` and `/api/trade/polymarket-profile` declare `runtime = "edge"` + `preferredRegion = ["hkg1"]`. This is what bypasses Polymarket's US-IP block. **Do not switch to the Node runtime** — Vercel will route you through US PoPs and Polymarket will respond with `403 region-restricted`.

2. **Vercel KV is mandatory in production.** x402 nonce replay-protection and Gamma cache rely on Upstash Redis via Vercel KV. Local dev falls back to in-memory KV, which is fine for dev but unacceptable in production (cold starts wipe state).

3. **Sync env vars after every change.** Vercel does **not** auto-pull from the repo. After editing `.env.local`, run `./scripts/deploy-vercel.sh --env-only` or update the dashboard manually.

4. **WalletConnect Project ID is required.** Without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, mobile QR-code login crashes immediately.

5. **Isolate contract addresses per environment.** Once `PaymentVault` is deployed on Arc Testnet, set `NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS` separately for each of the three Vercel environments (prod / preview / dev). This prevents preview deploys from polluting the production payment trail.

6. **No CLOB API key on the server.** Polymarket's L2 API key is **derived from the user's wallet signature** (EIP-712), cached in the browser's `localStorage`, and **never touches our backend**. We hold zero user secrets.

---

## 🔧 Environment Variables

Full list in [`.env.example`](./.env.example). Key entries:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_ARC_CHAIN_ID` / `_ARC_RPC_URL` | Arc Testnet config (x402 settlement) |
| `NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS` | Deployed `PaymentVault` address |
| `NEXT_PUBLIC_USDC_ARC_ADDRESS` | USDC ERC20 on Arc Testnet |
| `NEXT_PUBLIC_INSIGHT_PRICE_USDC` | Per-event unlock price (default 0.5) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | RainbowKit / WalletConnect |
| `NEXT_PUBLIC_POLYGON_RPC_URL` | Polygon RPC (use your own Alchemy/Quicknode in prod) |
| `DEEPSEEK_API_KEY` / `_BASE_URL` / `_MODEL` | DeepSeek streaming chat |
| `TIKHUB_API_KEY` / `_BASE_URL` | TikHub multi-source intel |
| `GAMMA_BASE_URL` | Polymarket Gamma API (defaults to public) |
| `KV_REST_API_URL` / `_TOKEN` | Vercel KV (Upstash Redis) |

---

## 🎬 Demo Script (5 steps, ~3 minutes)

1. **Home page · AI Picked rail.** Live Polymarket markets, sorted by AI hotness, refreshed every minute.
2. **Open an event.** YES/NO duo-color hero, volume / liquidity / category — all from Polymarket Gamma.
3. **Click `Unlock AI Insight · 0.5 USDC`.**
   - Wallet pops twice: `approve` USDC → `PaymentVault.pay()`.
   - Server replies 402 → verifies the on-chain `Paid` log → opens SSE.
   - The right rail fills with TikHub evidence cards while the left rail streams the markdown report.
4. **Read the AI verdict KPIs:** YES probability, confidence, suggested side, suggested size.
5. **Click `Trade YES / NO on Polymarket`.**
   - Wallet auto-switches to Polygon.
   - We probe the funding wallet → probe wallet-kind → auto-derive API key → one EIP-712 signature → order placed.
   - **No API key copy-paste required at any point.**

---

## 📦 Tech Stack

Next.js 14 · TypeScript · Tailwind · shadcn-style components · Zustand
viem · wagmi v2 · RainbowKit v2 · Solidity 0.8.24 · Foundry · OpenZeppelin
DeepSeek (`deepseek-chat`) · TikHub · **Polymarket V2 Gamma + CLOB** (`@polymarket/clob-client-v2`) · Vercel + Vercel KV.

---

## 📜 License

MIT
