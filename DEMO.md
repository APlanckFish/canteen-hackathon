# Live Demo Runbook

Print this. Read it cold. ~3 minutes.

## Pre-flight checklist (do once before pitching)

- [ ] `pnpm install` — fresh
- [ ] `.env.local` filled (Arc chainId/RPC, PaymentVault address, USDC address, DeepSeek key, TikHub key, KV credentials, WalletConnect projectId)
- [ ] `pnpm contracts:deploy:arc` — record the printed address into `NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS`
- [ ] Demo wallet (browser extension) holds at least:
  - **Arc Testnet**: ≥ 5 USDC + a sliver of native gas
  - **Polygon**: ≥ 1 USDC.e + a sliver of MATIC (only if attempting real CLOB sign — otherwise depink path is fine)
- [ ] `pnpm build && pnpm start`, or deploy to Vercel preview
- [ ] Open the page once to warm up the cache (Gamma 60s TTL)

## Talk track (script)

> **Slide 0 (15s)** — "Canteen Insight uses x402 to turn AI research into an
> onchain product. Pay 0.5 USDC, get a deep-research report, trade on Polymarket."

> **Step 1 — Markets (20s)**
> Land on `/`. Hover the *AI Picked* rail. Point out:
> "These are the live Polymarket markets, ranked by AI hotness; refreshed every minute."

> **Step 2 — Event detail (15s)**
> Click the most attention-grabbing card. Show the YES/NO duo-color hero, the
> volume + liquidity strip. "All read directly from Polymarket Gamma."

> **Step 3 — x402 unlock (60s, the money shot)**
> Click `Unlock AI Insight · 0.5 USDC`. Narrate:
> 1. "Wallet pops once for USDC `approve`."
> 2. "Wallet pops again for `PaymentVault.pay(eventId, amount, nonce)`."
> 3. "Server returns 402 first, then verifies the on-chain `Paid` log before opening the SSE stream."
>
> When the right rail starts populating with evidence cards: "These are TikHub
> multi-source feeds — TikTok, X, YouTube, Google News — fetched in parallel."

> **Step 4 — AI report (45s)**
> Watch the markdown stream in. Once verdict KPIs appear:
> "DeepSeek emits structured JSON at the end of the stream — that's how we get
> a calibrated YES probability, confidence, and suggested size."

> **Step 5 — Trade (20s)**
> Click `Trade YES on Polymarket`. Wallet switches chain. Either:
> - real CLOB sign (if `@polymarket/clob-client` is enabled), or
> - open the Polymarket page with the side pre-selected.

> **Step 6 — Portfolio (15s)**
> Click into `/portfolio`. "Every x402 unlock is receipted locally and onchain.
> The ledger column maps each payment to a TikHub apikey settlement — happening
> async on the operator side."

## If something breaks

- **Gamma returns empty**: refresh the page; soft-fallback shows a "no markets" panel — pivot the talk to "the API layer is hardened against upstream outages".
- **Wallet rejects chain switch**: TradeButton auto-deep-links anyway.
- **DeepSeek timeout**: stub stream kicks in, the verdict still appears (a) — explain it as "deterministic fallback for offline demos".
- **PaymentVault not deployed**: `Unlock` will surface a server error with code `X402_INTERNAL`. Have a screenshot of a successful run as backup.

## Q&A primers

- *"Why two chains?"* — Arc for x402 settlement (Hackathon requirement, sub-cent gas, USDC-native). Polygon because that's where Polymarket actually lives. wagmi v2 supports both in one config; users see one wallet.
- *"Is the AI cheating?"* — DeepSeek emits a fenced JSON verdict at end-of-stream; we parse and surface it. Stream is verbatim from the model; the verdict is calibrated by the prompt rules.
- *"What about TikHub auto top-up?"* — Investigated; not exposed by TikHub today. We persist a ledger entry per payment so the operator settles asynchronously, and we built a pluggable `settler.ts` so a future automation drop-in is one file.
- *"Why is this not just chat-with-tools?"* — Onchain payment guards the expensive AI/Tikhub calls; replay-protected; usable as a primitive by any other wallet.
