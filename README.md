# Canteen Insight · AI × x402 × Polymarket

> Hackathon submission for **Canteen × Circle**.
> A Polymarket-style web app that lets users pay micro USDC on **Arc Testnet via x402**
> to unlock an AI-driven research report (TikHub multi-source intelligence + DeepSeek
> reasoning), then trade directly on **Polymarket** (Polygon Mainnet).

---

## Architecture at a glance

```
Browser (Next.js + wagmi + RainbowKit)
   │                                ▲
   │ 1) POST /api/insight/[eventId] │
   ▼                                │ SSE: status / evidence / delta / verdict / done
[Vercel] Next.js Route Handlers ─────┘
   │            │            │
   │ 402        │ TikHub     │ DeepSeek (stream)
   │ challenge  │ aggregator │
   ▼            ▼            ▼
[Arc Testnet]  [TikHub API]  [DeepSeek API]
PaymentVault   tt/x/yt/news  deepseek-chat
   ▲
   │ 2) wallet pays USDC
   │ 3) X-PAYMENT proof → server verifies Paid log via viem
```

The user sees **one button**: *"Unlock AI Insight · 0.5 USDC"*. Behind the scenes,
the app performs the full x402 dance, validates the on-chain `Paid` event, then
streams a structured research report with a YES/NO verdict and a suggested size.

---

## Repository layout

```
canteen-hackthon/
├── apps/web/                 # Next.js 14 App Router app (UI + API middleware)
├── packages/shared/          # cross-package types, ABI, x402 protocol consts
├── contracts/                # Foundry workspace for PaymentVault.sol
├── .env.example              # all required env vars
└── README.md
```

### Key modules in `apps/web`

| Path | Purpose |
| --- | --- |
| `app/api/insight/[eventId]/route.ts` | x402 three-step handshake + SSE stream |
| `app/api/markets/hot/route.ts` | Polymarket Gamma proxy + AI-curated picks |
| `lib/x402/{server,client}.ts` | Challenge generation, verification, fetch wrapper |
| `lib/ai/{deep-analyzer,topic-curator}.ts` | Two-agent orchestration (no LangChain) |
| `lib/tikhub/{client,aggregator,settler}.ts` | Multi-source TikHub fetch + ledger |
| `lib/deepseek/{client,prompts}.ts` | Streaming + structured-verdict parsing |
| `lib/polymarket/{gamma,clob}.ts` | Read markets + place / deep-link orders |
| `hooks/usePayAndUnlock.ts` | Wallet → approve → pay → SSE consumer |
| `components/insight/*` | UnlockButton, InsightReport, EvidencePanel |
| `components/trade/TradeButton.tsx` | Switch chain to Polygon + place / deep-link |

### Smart contract — `contracts/src/PaymentVault.sol`

- `pay(bytes32 eventId, uint256 amount, uint256 nonce)` — user transfers USDC, contract emits `Paid`.
- `withdraw(address to, uint256 amount)` — `onlyOwner`.
- `setMinPrice(uint256)` — `onlyOwner`, raises/lowers the per-event price.
- Replay protection: `(payer, nonce)` is single-use.
- Tested with Foundry (`contracts/test/PaymentVault.t.sol`, 7 test cases, all passing).

---

## Local setup

### Prerequisites

- Node.js ≥ 20
- `pnpm` 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)

### Install

```bash
pnpm install
cp .env.example .env.local
# fill in DEEPSEEK_API_KEY, TIKHUB_API_KEY, NEXT_PUBLIC_ARC_*, NEXT_PUBLIC_*_ADDRESS
```

### Contracts

```bash
pnpm contracts:test            # forge test -vv
pnpm contracts:deploy:arc      # broadcast Deploy.s.sol to ARC_RPC_URL
```

After deployment, copy the address into `NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS`.

### Web

```bash
pnpm dev    # runs apps/web at http://localhost:3000
```

- Without `DEEPSEEK_API_KEY` / `TIKHUB_API_KEY`, the analyzer falls back to a
  deterministic stub stream, so the demo flow always works end-to-end.
- Without `KV_REST_API_*`, an in-memory KV is used (per-process, ephemeral) — fine
  for local development; required in production for x402 nonce / replay state.

### Production build

```bash
pnpm build
```

---

## Environment variables

See `.env.example`. Highlights:

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_ARC_CHAIN_ID` / `_ARC_RPC_URL` | Arc Testnet config (x402 settlement) |
| `NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS` | Address of deployed `PaymentVault` |
| `NEXT_PUBLIC_USDC_ARC_ADDRESS` | USDC ERC20 on Arc Testnet |
| `NEXT_PUBLIC_INSIGHT_PRICE_USDC` | Per-event unlock price (default 0.5) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | RainbowKit / WalletConnect |
| `DEEPSEEK_API_KEY` / `_BASE_URL` / `_MODEL` | DeepSeek streaming chat |
| `TIKHUB_API_KEY` / `_BASE_URL` | TikHub multi-source intelligence |
| `GAMMA_BASE_URL` | Polymarket Gamma API (default public) |
| `KV_REST_API_URL` / `_TOKEN` | Vercel KV (Upstash Redis) for nonce / ledger |
| `OPS_WALLET_PRIVATE_KEY` | (optional) reserved for the future TikHub auto-settler |

---

## Demo script (5 steps, ~3 minutes)

1. **Open the home page** — point at the *AI Picked* rail. Note the `Hotness` badges,
   live YES/NO probabilities, and 24h volume sourced from Polymarket Gamma.
2. **Click into an event** — show the dual-color hero (YES vs NO), volume / liquidity / category.
3. **Click `Unlock AI Insight · 0.5 USDC`**:
   - Wallet pops twice: once to `approve` USDC, once to call `PaymentVault.pay()`.
   - Server returns 402 → wallet signs → server verifies the on-chain `Paid` log.
   - SSE starts: status → evidence (TikHub multi-source bundle appears in the right rail) → live markdown report streams in.
4. **Show the verdict KPIs**: AI YES Prob, Confidence, Suggested Side, Suggested Size.
5. **Click `Trade YES on Polymarket`**:
   - Wallet auto-switches to Polygon.
   - Either signs an order via `@polymarket/clob-client` (when enabled) or opens the official Polymarket page with the suggested side pre-selected.

Bonus: **`/portfolio`** shows the local history of unlocks, total spent, and average AI confidence.

---

## Risk & fallback playbook (for live demo)

| Risk | Fallback in code |
| --- | --- |
| TikHub API down / unauthorized | Per-source `Promise.allSettled` → empty source returns `[]`; analyzer still produces verdict from remaining evidence. Stub bundle when no key. |
| DeepSeek slow / down | 60s `maxDuration` on the route + deterministic stub stream when key missing. |
| Polymarket Gamma rate-limited | Vercel KV cache for 60s; soft-fails to empty list, UI shows "no markets" rather than crashing. |
| Arc RPC flaky | viem `waitForTransactionReceipt` with 30s timeout + clear error code surfaced as `X402_TX_NOT_FOUND`. |
| Wallet refuses chain switch | TradeButton catches and falls back to deep-link unconditionally. |
| `clob-client` install heavy / fails | Dynamic-import wrapped in try/catch; deep-link path is the default. |
| Nonce replay attack | KV `consumed:txHash` set with 24h TTL; contract enforces `(payer,nonce)` uniqueness on top. |
| Demo wallet runs out of USDC | Operator pre-funds and uses the Owner `withdraw` to recycle. |

---

## TikHub auto-settle status

Per project decision, this hackathon delivers the **simplified** path:
the operator pre-funds the TikHub apikey balance, and every paid x402 unlock is
recorded by `lib/tikhub/settler.ts` for **asynchronous off-chain settlement**.
Real-time auto top-up was investigated and is intentionally out of scope —
TikHub does not currently expose a programmatic top-up API. The settler module
is structured as a pluggable interface so it can be swapped to a TRC20 forwarder
or an official top-up endpoint without changes elsewhere.

---

## Tech stack

Next.js 14 · TypeScript · Tailwind · shadcn-style components · Zustand
· viem · wagmi v2 · RainbowKit v2 · Solidity 0.8.24 · Foundry · OpenZeppelin
· DeepSeek (`deepseek-chat`) · TikHub · Polymarket Gamma + CLOB · Vercel + Vercel KV.

---

## License

MIT — see `LICENSE` (to be added before final submission).
