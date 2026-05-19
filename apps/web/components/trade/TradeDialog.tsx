"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatUnits, parseUnits } from "viem";
import { getWalletClient } from "@wagmi/core";
import {
  useAccount,
  useChainId,
  useConfig,
  usePublicClient,
  useSwitchChain,
} from "wagmi";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Wallet,
  X,
} from "lucide-react";
import { polygonMainnet } from "@/lib/chains";
import { cn, formatUsd, shortHash } from "@/lib/utils";
import type { MarketSummary, InsightVerdict } from "@canteen/shared/insight";
import {
  readApprovalStatus,
  readPolBalance,
  type ApprovalStatus,
} from "@/lib/polymarket/approvals";
import { readPusdBalance } from "@/lib/polymarket/onramp";
import { lookupFundingWallet } from "@/lib/polymarket/deposit-wallet";
import {
  detectWalletKind,
  walletKindToSigType,
  type WalletKind,
} from "@/lib/polymarket/wallet-type";
import { makeViemSdkSigner } from "@/lib/polymarket/viem-signer";
import { useT } from "@/lib/i18n/provider";

type TradeSide = "YES" | "NO";

type Stage =
  | "idle"
  | "checking"
  | "switchingChain"
  | "signing"
  | "submitting"
  | "done"
  | "error";

interface Props {
  open: boolean;
  onClose: () => void;
  market: MarketSummary;
  verdict?: InsightVerdict;
}

/**
 * Polymarket order minimums (official rules):
 *   - Market orders (FOK/FAK BUY): $1 USD minimum (amount = USD).
 *   - Limit orders (GTC):          5 shares  minimum (size  = shares).
 *
 * We use FAK BUY (Fill And Kill market order). FAK fills as much as
 * possible at the best available ask and cancels any unfilled remainder
 * — unlike FOK which rejects the whole order if it can't fully fill.
 * FAK is what polymarket.com's "Buy" button uses.
 */
const MIN_USD_MARKET_ORDER = 1;
const DEFAULT_YES_PRICE = 0.5;

/**
 * Local cache for the user-pasted Polymarket API credentials, keyed by
 * (EOA × deposit-wallet). Polymarket V2 makes the EOA-only path unusable for
 * brand-new wallets (server returns "maker address not allowed, please use
 * the deposit wallet flow"), and `createApiKey` from the SDK can't bind a
 * key to a deposit wallet — so the user must obtain creds from
 * polymarket.com → Settings → API Keys and paste them here once.
 */
const CREDS_KEY = "canteen.polymarket.creds.v7";
interface CachedCreds {
  key: string;
  secret: string;
  passphrase: string;
  owner: string;
  funder: string;
}
function credsMatch(
  c: CachedCreds,
  owner: string,
  funder: string,
): boolean {
  return (
    c.owner.toLowerCase() === owner.toLowerCase() &&
    c.funder.toLowerCase() === funder.toLowerCase()
  );
}
function loadCreds(owner: string, funder: string): CachedCreds | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedCreds;
    return credsMatch(c, owner, funder) ? c : null;
  } catch {
    return null;
  }
}
function saveCreds(c: CachedCreds): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CREDS_KEY, JSON.stringify(c));
  } catch {
    /* quota — non-fatal */
  }
}

export function TradeDialog({ open, onClose, market, verdict }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: polygonMainnet.id });
  const config = useConfig();
  const { t } = useT();

  // Default side: respect AI verdict, fall back to market consensus.
  const aiSide: TradeSide = useMemo(() => {
    if (verdict?.suggestedSide === "YES") return "YES";
    if (verdict?.suggestedSide === "NO") return "NO";
    return (market.yesProb ?? 0.5) >= 0.5 ? "YES" : "NO";
  }, [verdict?.suggestedSide, market.yesProb]);
  const aiSize = Math.max(
    MIN_USD_MARKET_ORDER,
    verdict?.suggestedSizeUsd ?? 5,
  );

  const [side, setSide] = useState<TradeSide>(aiSide);
  const [sizeStr, setSizeStr] = useState(aiSize.toFixed(2));
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  // On-chain state read from the deposit wallet (the funder).
  const [pusdBal, setPusdBal] = useState<bigint | null>(null);
  const [polBal, setPolBal] = useState<bigint | null>(null);
  const [approvals, setApprovals] = useState<ApprovalStatus | null>(null);
  // Authoritative negRisk flag (resolved via CLOB /neg-risk).
  const [negRisk, setNegRisk] = useState<boolean | null>(
    market.negRisk === true ? true : null,
  );
  // V2 funding wallet (deposit wallet owned by the EOA on polymarket.com).
  // null = not looked up yet, "" = looked up but user has no Polymarket account.
  const [fundingWallet, setFundingWallet] = useState<
    `0x${string}` | "" | null
  >(null);
  // Detected wallet kind — drives which SignatureTypeV2 we pass to the SDK.
  // Polymarket Safe wallets need sigType=2, deposit wallets sigType=3, etc.
  const [walletKind, setWalletKind] = useState<WalletKind | null>(null);

  // Stored creds (loaded from localStorage on mount; refreshed when SDK
  // auto-derives a fresh key on first trade).
  const [savedCreds, setSavedCreds] = useState<CachedCreds | null>(null);

  const tokenId =
    side === "YES" ? market.clobTokenIds?.yes : market.clobTokenIds?.no;

  const limitPrice = useMemo(() => {
    const base = side === "YES" ? market.yesProb : 1 - market.yesProb;
    const clamped = Math.min(0.99, Math.max(0.01, base || DEFAULT_YES_PRICE));
    const tick = market.tickSize ?? 0.01;
    return Math.round(clamped / tick) * tick;
  }, [market.yesProb, market.tickSize, side]);

  const sizeUsd = parseFloat(sizeStr || "0");
  const shareEstimate = limitPrice > 0 ? sizeUsd / limitPrice : 0;
  const requiredPusd = useMemo(
    () => parseUnits(Math.max(0, sizeUsd).toFixed(6), 6),
    [sizeUsd],
  );

  // Per-market minimum for our market-order flow:
  //   FOK BUY  → $1 USD floor (Polymarket's official minimum).
  // We still keep a tick-aligned price for diagnostics (estimating shares).
  const minUsd = MIN_USD_MARKET_ORDER;

  // ── reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setSide(aiSide);
    setSizeStr(aiSize.toFixed(2));
    setStage("idle");
    setErrorMsg(null);
    setOrderId(null);
    setApprovals(null);
    setPusdBal(null);
    setPolBal(null);
    setFundingWallet(null);
    setWalletKind(null);
    setSavedCreds(null);
    setNegRisk(market.negRisk === true ? true : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── resolve negRisk via CLOB /neg-risk ────────────────────────────────────
  useEffect(() => {
    if (!open || !tokenId) return;
    if (negRisk !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/trade/clob-proxy/neg-risk?token_id=${encodeURIComponent(tokenId)}`,
          { cache: "no-store" },
        );
        const json = (await r.json()) as { neg_risk?: boolean; error?: string };
        if (cancelled) return;
        if (!r.ok || typeof json.neg_risk !== "boolean") {
          throw new Error(json.error || `neg-risk lookup failed (${r.status})`);
        }
        setNegRisk(json.neg_risk);
      } catch (e) {
        if (cancelled) return;
        setErr(`Failed to resolve market type: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tokenId, negRisk]);

  // ── lookup deposit wallet from polymarket.com profile ─────────────────────
  useEffect(() => {
    if (!open || !address) return;
    if (fundingWallet !== null) return;
    let cancelled = false;
    (async () => {
      console.log("[funding] looking up", address);
      const w = await lookupFundingWallet(address);
      if (cancelled) return;
      console.log("[funding] resolved", w);
      setFundingWallet(w ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, address, fundingWallet]);

  // ── detect wallet kind once funding wallet is known ────────────────────────
  // We need to know if the funder is a Gnosis Safe (sigType=2),
  // Polymarket Proxy (sigType=1), or new Deposit Wallet (sigType=3) so we
  // pass the matching SignatureTypeV2 to the SDK at order signing time.
  useEffect(() => {
    if (!open || !publicClient) return;
    if (!fundingWallet || fundingWallet.length === 0) return;
    if (walletKind !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await detectWalletKind(publicClient, fundingWallet);
        if (cancelled) return;
        console.log("[walletKind] detected", r);
        setWalletKind(r.kind);
      } catch (e) {
        if (cancelled) return;
        console.warn("[walletKind] detect failed:", e);
        setWalletKind("UNKNOWN");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, publicClient, fundingWallet, walletKind]);

  // Load any previously saved creds once funding wallet is known.
  useEffect(() => {
    if (!open || !address || !fundingWallet || fundingWallet.length === 0) {
      setSavedCreds(null);
      return;
    }
    setSavedCreds(loadCreds(address, fundingWallet));
  }, [open, address, fundingWallet]);

  // Refresh on-chain balances + approvals (read from the deposit wallet).
  const refreshChainState = useCallback(async () => {
    if (!address || !publicClient) return;
    if (negRisk === null) return;
    if (!fundingWallet || fundingWallet.length === 0) return;
    setStage("checking");
    try {
      const funder = fundingWallet;
      const [pu, p, a] = await Promise.all([
        readPusdBalance(publicClient, funder),
        readPolBalance(publicClient, address), // gas paid by EOA owner
        readApprovalStatus(publicClient, funder, negRisk),
      ]);
      setPusdBal(pu);
      setPolBal(p);
      setApprovals(a);
      setStage("idle");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStage("error");
    }
  }, [address, publicClient, negRisk, fundingWallet]);

  useEffect(() => {
    if (!open || !address || negRisk === null) return;
    if (!fundingWallet || fundingWallet.length === 0) return;
    void refreshChainState();
  }, [open, address, negRisk, fundingWallet, refreshChainState]);

  // ── helpers ────────────────────────────────────────────────────────────────

  const ensureChainAndWallet = async () => {
    if (chainId !== polygonMainnet.id) {
      setStage("switchingChain");
      await switchChainAsync({ chainId: polygonMainnet.id });
    }
    const wc = await getWalletClient(config, { chainId: polygonMainnet.id });
    if (!wc) throw new Error("Wallet not connected on Polygon");
    return wc;
  };

  /**
   * Submit a real Polymarket V2 CLOB order via @polymarket/clob-client-v2.
   * SDK auto-derives the L2 API key on first call; signature type is picked
   * based on the on-chain wallet kind (Safe/Proxy/DepositWallet).
   */
  const handleSubmit = async () => {
    console.log("[submit] handleSubmit called");
    if (!publicClient || !address) return;
    if (!tokenId) return setErr(t("td.err.noTokenId"));
    if (negRisk === null) return setErr(t("td.err.marketTypeUnresolved"));
    if (!fundingWallet || fundingWallet.length === 0) {
      return setErr(t("td.err.noDepositWallet"));
    }
    if (walletKind === null) {
      return setErr(t("td.err.detectingWallet"));
    }
    if (!(sizeUsd >= minUsd))
      return setErr(
        t("td.err.tooSmall", {
          value: sizeUsd.toFixed(2),
          min: minUsd.toFixed(2),
        }),
      );
    if (!pusdBal || pusdBal < requiredPusd)
      return setErr(t("td.err.notEnoughPusd"));
    if (!polBal || polBal === 0n) return setErr(t("td.err.noGas"));
    if (!approvals?.allReady) return setErr(t("td.err.notApproved"));

    setErrorMsg(null);

    let wc;
    try {
      wc = await ensureChainAndWallet();
    } catch (e) {
      return setErr((e as Error).message);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let SdkExports: any;
    try {
      SdkExports = await import("@polymarket/clob-client-v2");
    } catch (e) {
      return setErr(`Failed to load Polymarket V2 SDK: ${(e as Error).message}`);
    }
    const { ClobClient, OrderType, Side, Chain } = SdkExports;

    const signer = makeViemSdkSigner(wc, address);
    const proxyHost =
      typeof window !== "undefined"
        ? `${window.location.origin}/api/trade/clob-proxy`
        : "/api/trade/clob-proxy";

    // Pick the SignatureTypeV2 based on the actual on-chain contract kind.
    // For your wallet `0xeabd92...` we detected GNOSIS_SAFE → sigType=2.
    // Wrong sigType → server rejects with version_mismatch / signer_mismatch.
    const sigType = walletKindToSigType(walletKind ?? "UNKNOWN");
    console.log("[submit] using sigType", sigType, "for kind", walletKind);

    // ── obtain L2 creds ───────────────────────────────────────────────────
    // Two paths:
    //   1) User pasted creds from polymarket.com (if available, use them).
    //   2) Otherwise auto-derive via SDK. For "Existing Safe/Proxy users"
    //      (sigType 1/2), official docs say their setup is unaffected by
    //      V2, and SDK createOrDeriveApiKey() should work — the key is
    //      bound to the EOA but the Safe/Proxy still validates orders via
    //      its own signing path.
    let credsToUse:
      | { key: string; secret: string; passphrase: string }
      | null = savedCreds
      ? {
          key: savedCreds.key,
          secret: savedCreds.secret,
          passphrase: savedCreds.passphrase,
        }
      : null;

    if (!credsToUse) {
      try {
        setStage("signing");
        console.log("[auth] auto-deriving CLOB API creds via SDK…");
        const bootstrap = new ClobClient({
          host: proxyHost,
          chain: Chain.POLYGON,
          signer,
          throwOnError: false,
        });
        let derived = await bootstrap.createOrDeriveApiKey();
        console.log("[auth] createOrDeriveApiKey →", derived);
        if (!derived?.key) {
          derived = await bootstrap.deriveApiKey();
          console.log("[auth] deriveApiKey fallback →", derived);
        }
        if (!derived?.key) {
          throw new Error(
            derived?.error ||
              `auth response missing key: ${JSON.stringify(derived).slice(0, 400)}`,
          );
        }
        credsToUse = {
          key: derived.key,
          secret: derived.secret,
          passphrase: derived.passphrase,
        };
        // Persist so subsequent submits don't re-prompt for signature.
        const c: CachedCreds = {
          ...credsToUse,
          owner: address,
          funder: fundingWallet,
        };
        saveCreds(c);
        setSavedCreds(c);
      } catch (e) {
        return setErr(
          `Failed to derive API credentials: ${(e as Error).message}`,
        );
      }
    }

    const client = new ClobClient({
      host: proxyHost,
      chain: Chain.POLYGON,
      signer,
      creds: credsToUse,
      signatureType: sigType,
      funderAddress: fundingWallet,
      throwOnError: true,
    });

    // ── DIAGNOSTIC: inspect what address the API key is bound to ──────────
    // The error "the order signer address has to be the address of the API
    // KEY" means the server-side binding of the key doesn't match the order
    // signer field (= deposit wallet for POLY_1271). We dump the raw
    // /auth/api-keys response so we can see the actual binding.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keys = await (client as any).getApiKeys?.();
      console.log("[diag] /auth/api-keys for this creds →", keys);
    } catch (e) {
      console.warn("[diag] getApiKeys() failed (non-fatal):", e);
    }

    setStage("signing");
    let resp;
    try {
      // ── Map market.tickSize (number) → SDK's TickSize string ───────────
      // SDK's ROUNDING_CONFIG only accepts the 4 exact keys below.
      // Naive `.toFixed(2)` produces "0.10" → ROUNDING_CONFIG["0.10"] is
      // undefined → SDK crashes with "Cannot read properties of undefined
      // (reading 'price')" inside getMarketOrderRawAmounts. So we snap to
      // the nearest allowed key here.
      const tickSizeStr: "0.1" | "0.01" | "0.001" | "0.0001" = (() => {
        const t = market.tickSize ?? 0.01;
        if (t <= 0.0001) return "0.0001";
        if (t <= 0.001) return "0.001";
        if (t <= 0.01) return "0.01";
        return "0.1";
      })();
      // ── Use a MARKET (FOK) BUY order ─────────────────────────────────────
      // Polymarket's official minimum for market orders is $1 USD; for
      // GTC limit orders it's 5 shares. `amount` for a BUY market order is
      // the USD amount to spend.
      //
      // We pass `price` explicitly (= our limit price). If we omit it, the
      // SDK calls `calculateMarketPrice` which fetches the orderbook and
      // walks asks; on thin/empty books or unexpected response shape, that
      // throws cryptic errors like "Cannot read properties of undefined
      // (reading 'price')". Passing it directly is more robust.
      // ── FAK BUY (Fill And Kill) ──────────────────────────────────────────
      // We use FAK rather than FOK because FOK rejects the whole order if
      // it can't be fully filled at the requested price; FAK fills as much
      // as possible at the best available ask and cancels the remainder.
      //
      // We DO NOT pass `price`. When omitted, the SDK calls
      // `calculateMarketPrice` which fetches the orderbook and returns the
      // worst price needed to fill `amount` USD — this is exactly what a
      // user expects from a market BUY.
      const args = {
        tokenID: tokenId,
        amount: parseFloat(sizeUsd.toFixed(2)),
        side: Side.BUY,
        orderType: OrderType.FAK,
      };
      console.log("[V2 createMarketOrder] args", {
        ...args,
        tickSize: tickSizeStr,
        negRisk,
      });

      let signed;
      try {
        signed = await client.createMarketOrder(args, {
          tickSize: tickSizeStr,
          negRisk,
        });
      } catch (e) {
        console.error("[V2 createMarketOrder] failed", e);
        throw new Error(
          `createMarketOrder failed: ${(e as Error)?.message || String(e)}`,
        );
      }
      console.log("[V2 signed market order]", {
        signer: signed.signer,
        maker: signed.maker,
        signatureType: signed.signatureType,
        signaturePrefix:
          typeof signed.signature === "string"
            ? signed.signature.slice(0, 40) + "…"
            : "?",
      });

      setStage("submitting");
      resp = await client.postOrder(signed, OrderType.FAK);
      console.log("[V2 postOrder response]", resp);
    } catch (e) {
      return setErr(t("td.err.submitFailed", { msg: (e as Error).message }));
    }

    const id = resp?.orderID || resp?.orderId || resp?.id;
    if (!id) {
      return setErr(
        `Submit succeeded but no orderID: ${JSON.stringify(resp).slice(0, 400)}`,
      );
    }
    setOrderId(id);
    setStage("done");
  };

  const setErr = (msg: string) => {
    setErrorMsg(msg);
    setStage("error");
  };

  // ── derived flags & step-by-step state ────────────────────────────────────
  const onPolygon = chainId === polygonMainnet.id;
  const haveDepositWallet =
    fundingWallet !== null && fundingWallet !== "" && fundingWallet.length > 0;
  const havePusd = pusdBal !== null && pusdBal >= requiredPusd;
  const haveGas = polBal !== null && polBal > 0n;
  const haveApprovals = !!approvals?.allReady;
  const haveCreds = !!savedCreds;
  const haveAnyPusd = pusdBal !== null && pusdBal > 0n;

  // 4-step onboarding state. Each step is "done" / "current" / "pending".
  const stepStatuses = {
    s1Account: haveDepositWallet,
    // We use "any pUSD in deposit wallet AND approvals=ready" as the proxy
    // signal that the user has completed their first trade on polymarket.com
    // (which is what mints both the pUSD and the on-chain approvals).
    s2FirstTrade: haveDepositWallet && haveAnyPusd && haveApprovals,
    // Step 3 is shown as done if user already has creds (cached or pasted).
    // It's no longer required up front — submit will auto-derive on demand.
    s3PasteKey: haveCreds,
    // Step 4 only requires creds OR auto-derive capability + balance + gas.
    s4Ready:
      haveDepositWallet &&
      haveAnyPusd &&
      haveApprovals &&
      haveGas &&
      walletKind !== null,
  };

  const allReady = stepStatuses.s4Ready && havePusd && !!tokenId;
  const busy =
    stage === "checking" ||
    stage === "switchingChain" ||
    stage === "signing" ||
    stage === "submitting";

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="glass-card-strong relative w-full max-w-md rounded-2xl p-6 space-y-5 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-foreground-dim hover:text-white transition-colors"
          aria-label={t("td.close")}
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-foreground-dim">
            {t("td.title")} · V2
          </div>
          <div className="text-lg font-semibold leading-tight line-clamp-2">
            {market.question}
          </div>
        </div>

        {/* ── Side toggle ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          {(["YES", "NO"] as const).map((s) => {
            const active = s === side;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                disabled={busy}
                className={cn(
                  "rounded-xl border px-3 py-3 text-sm font-semibold transition-all",
                  s === "YES" && active && "border-yes/40 bg-yes-soft text-yes",
                  s === "NO" && active && "border-no/40 bg-no-soft text-no",
                  !active &&
                    "border-border text-foreground-muted hover:border-white/30",
                )}
              >
                {s}
                <div className="text-[11px] font-normal opacity-80 mt-0.5">
                  @ {(s === "YES" ? market.yesProb : 1 - market.yesProb).toFixed(2)}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Amount input ───────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="text-xs text-foreground-dim flex items-center justify-between">
            <span>{t("td.amount.label")}</span>
            {verdict?.suggestedSizeUsd ? (
              <span className="text-[11px]">
                {t("td.amount.aiSuggest", { value: formatUsd(aiSize) })}
              </span>
            ) : null}
          </label>
          <div className="relative">
            <input
              type="number"
              min={minUsd.toFixed(2)}
              step="0.25"
              value={sizeStr}
              onChange={(e) => setSizeStr(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-border bg-black/30 px-4 py-3 text-base outline-none focus:border-accent/60 disabled:opacity-50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground-dim">
              USD
            </span>
          </div>
          <div className="text-[11px] text-foreground-dim flex items-center justify-between">
            <span>
              {t("td.amount.shareEstimate", {
                shares: shareEstimate.toFixed(2),
                side,
                price: limitPrice.toFixed(2),
              })}
            </span>
            <span
              className={cn(
                sizeUsd < minUsd ? "text-no" : "text-foreground-dim",
              )}
            >
              {t("td.amount.min", { min: minUsd.toFixed(2) })}
            </span>
          </div>
        </div>

        {/* ── 4-step onboarding stepper ─────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-black/20 p-3 space-y-3 text-xs">
          <div className="text-[11px] uppercase tracking-wider text-foreground-dim">
            {t("td.setup.title")}
          </div>

          {/* Step 1: deposit wallet detected + funded + approved */}
          <Step
            num={1}
            done={stepStatuses.s1Account && stepStatuses.s2FirstTrade}
            title={t("td.step.account.title")}
            body={
              fundingWallet === null ? (
                <span className="text-foreground-dim">
                  {t("td.step.lookingUp")}
                </span>
              ) : !haveDepositWallet ? (
                <span className="text-no">
                  {t("td.step.notFoundPre")}
                  <a
                    href="https://polymarket.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline"
                  >
                    polymarket.com
                  </a>
                  {t("td.step.notFoundPost")}
                </span>
              ) : (
                <div className="space-y-0.5">
                  <div className="font-mono">
                    {shortHash(fundingWallet, 6, 6)}
                    <span className="text-foreground-dim ml-1">
                      ({walletKind === null
                        ? t("td.walletKind.detecting")
                        : walletKind === "GNOSIS_SAFE"
                          ? t("td.walletKind.safe")
                          : walletKind === "POLY_PROXY"
                            ? t("td.walletKind.proxy")
                            : walletKind === "DEPOSIT_WALLET"
                              ? t("td.walletKind.deposit")
                              : t("td.walletKind.unknown")})
                    </span>
                  </div>
                  <div className="text-foreground-dim">
                    {t("td.label.cash")}: $
                    {pusdBal === null
                      ? "…"
                      : parseFloat(formatUnits(pusdBal, 6)).toFixed(2)}
                    {" · "}
                    {t("td.row.approvals")}:{" "}
                    {approvals === null
                      ? "…"
                      : haveApprovals
                        ? t("td.approvals.ready")
                        : t("td.approvals.pending")}
                  </div>
                  {!stepStatuses.s2FirstTrade && haveDepositWallet ? (
                    <div className="text-foreground-muted">
                      {t("td.step.depositPre")}
                      <a
                        href="https://polymarket.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline inline-flex items-center gap-0.5"
                      >
                        polymarket.com{" "}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      {t("td.step.depositPost")}
                    </div>
                  ) : null}
                </div>
              )
            }
          />

          {/* Step 2: ready to trade */}
          <Step
            num={2}
            done={stepStatuses.s4Ready}
            title={t("td.step.ready.title")}
            body={
              !stepStatuses.s2FirstTrade ? (
                <span className="text-foreground-dim">
                  {t("td.step.completeFirst")}
                </span>
              ) : stepStatuses.s4Ready ? (
                <div className="space-y-0.5">
                  <div className="text-foreground-dim">
                    {t("td.label.gas")}:{" "}
                    {polBal === null
                      ? "…"
                      : `${parseFloat(formatUnits(polBal, 18)).toFixed(3)} POL`}
                  </div>
                  <div className="text-foreground-dim text-[10px]">
                    {haveCreds ? t("td.creds.cached") : t("td.creds.derive")}
                  </div>
                  {!havePusd ? (
                    <div className="text-no">
                      {t("td.needPusd", {
                        need: formatUnits(requiredPusd, 6),
                        have:
                          pusdBal === null
                            ? "…"
                            : parseFloat(formatUnits(pusdBal, 6)).toFixed(2),
                      })}
                    </div>
                  ) : null}
                </div>
              ) : (
                <span className="text-foreground-dim">
                  {t("td.step.completeAbove")}
                </span>
              )
            }
          />
        </div>

        {/* ── Action button ──────────────────────────────────────────────── */}
        {!onPolygon ? (
          <button
            type="button"
            onClick={async () => {
              setErrorMsg(null);
              try {
                setStage("switchingChain");
                await switchChainAsync({ chainId: polygonMainnet.id });
                setStage("idle");
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
            disabled={busy}
            className="neon-button h-12 w-full"
          >
            {stage === "switchingChain" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("td.cta.switching")}</span>
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4" />
                <span>{t("td.cta.switchChain")}</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !allReady || stage === "done"}
            className={cn(
              "neon-button h-12 w-full",
              side === "NO" && "bg-no/80 hover:bg-no",
            )}
          >
            {stage === "signing" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("td.cta.signing")}</span>
              </>
            ) : stage === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("td.cta.submitting")}</span>
              </>
            ) : stage === "done" ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>{t("td.cta.done")}</span>
              </>
            ) : (
              <span>
                {t("td.cta.placeOrder", { side, size: formatUsd(sizeUsd) })}
              </span>
            )}
          </button>
        )}

        {/* ── Result / error ─────────────────────────────────────────────── */}
        {stage === "done" && orderId ? (
          <div className="rounded-lg border border-yes/30 bg-yes-soft p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-yes font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("td.done.submitted")}
            </div>
            <div className="text-foreground-muted font-mono">
              {t("td.done.orderId", { id: shortHash(orderId, 8, 6) })}
            </div>
            <a
              href={`https://polymarket.com/event/${market.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              {t("td.done.viewOnPolymarket")}{" "}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : null}

        {errorMsg ? (
          <div className="rounded-lg border border-no/30 bg-no-soft p-3 text-xs text-no flex gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="break-words">{errorMsg}</span>
          </div>
        ) : null}

        <div className="text-[10px] text-foreground-dim text-center">
          {t("td.footer")}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Step({
  num,
  done,
  title,
  body,
}: {
  num: number;
  done: boolean;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <div className="shrink-0 mt-0.5">
        {done ? (
          <CheckCircle2 className="h-4 w-4 text-yes" />
        ) : (
          <Circle className="h-4 w-4 text-foreground-dim" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div
          className={cn(
            "text-xs font-semibold",
            done ? "text-yes" : "text-foreground-muted",
          )}
        >
          {num}. {title}
        </div>
        <div className="text-[11px] text-foreground-muted leading-relaxed">
          {body}
        </div>
      </div>
    </div>
  );
}
