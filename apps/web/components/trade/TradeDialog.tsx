"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatUnits } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import { polygonMainnet } from "@/lib/chains";
import { cn, formatUsd, shortHash } from "@/lib/utils";
import type { MarketSummary, InsightVerdict } from "@canteen/shared/insight";
import {
  ensureApprovals,
  readApprovalStatus,
  readPolBalance,
  readUsdceBalance,
  type ApprovalStatus,
} from "@/lib/polymarket/approvals";
import { buildAndSignBuyOrder, type TradeSide } from "@/lib/polymarket/order";
import { deriveOrLoadCreds, loadCachedCreds } from "@/lib/polymarket/api-key";

/**
 * Stages the dialog walks through. Order matters — every stage transition is
 * one of: user input → wallet popup → network call → done.
 */
type Stage =
  | "idle"
  | "checking" // reading balances & approvals
  | "needFunds"
  | "needApprove"
  | "approving"
  | "needAuth" // need to derive L2 creds
  | "authing"
  | "signing" // wallet popping for order signature
  | "submitting"
  | "done"
  | "error";

interface Props {
  open: boolean;
  onClose: () => void;
  market: MarketSummary;
  verdict?: InsightVerdict;
}

/** Min amount we'll let the user submit; matches Polymarket's tickier behavior. */
const MIN_USDC = 0.01;
/** Suggested fallback price if Gamma yesProb is missing. */
const DEFAULT_YES_PRICE = 0.5;

export function TradeDialog({ open, onClose, market, verdict }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: polygonMainnet.id });
  const { data: walletClient } = useWalletClient({ chainId: polygonMainnet.id });

  // ── form state ─────────────────────────────────────────────────────────────
  const aiSide: TradeSide = verdict?.suggestedSide === "NO" ? "NO" : "YES";
  const aiSize = Math.max(MIN_USDC, verdict?.suggestedSizeUsd ?? 1);

  const [side, setSide] = useState<TradeSide>(aiSide);
  const [sizeStr, setSizeStr] = useState(aiSize.toFixed(2));
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approveLog, setApproveLog] = useState<string>("");
  const [orderId, setOrderId] = useState<string | null>(null);

  // ── chain reads ────────────────────────────────────────────────────────────
  const [usdceBal, setUsdceBal] = useState<bigint | null>(null);
  const [polBal, setPolBal] = useState<bigint | null>(null);
  const [approvals, setApprovals] = useState<ApprovalStatus | null>(null);

  const tokenId = side === "YES" ? market.clobTokenIds?.yes : market.clobTokenIds?.no;
  const negRisk = market.negRisk === true;

  // Limit price for the order. We use the current Gamma probability but bias
  // it slightly so the small test order is unlikely to fill instantly (good
  // for demo: leaves an open order on the book that can be canceled).
  const limitPrice = useMemo(() => {
    const base = side === "YES" ? market.yesProb : 1 - market.yesProb;
    const clamped = Math.min(0.99, Math.max(0.01, base || DEFAULT_YES_PRICE));
    // Round to nearest tick (default 0.01).
    const tick = market.tickSize ?? 0.01;
    return Math.round(clamped / tick) * tick;
  }, [market.yesProb, market.tickSize, side]);

  const sizeUsd = parseFloat(sizeStr || "0");
  const shareEstimate = limitPrice > 0 ? sizeUsd / limitPrice : 0;

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setSide(aiSide);
    setSizeStr(aiSize.toFixed(2));
    setStage("idle");
    setErrorMsg(null);
    setApproveLog("");
    setOrderId(null);
    setApprovals(null);
    setUsdceBal(null);
    setPolBal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Auto-check balances + approvals when dialog opens ──────────────────────
  const refreshChainState = useCallback(async () => {
    if (!address || !publicClient) return;
    setStage("checking");
    try {
      const [u, p, a] = await Promise.all([
        readUsdceBalance(publicClient, address),
        readPolBalance(publicClient, address),
        readApprovalStatus(publicClient, address, negRisk),
      ]);
      setUsdceBal(u);
      setPolBal(p);
      setApprovals(a);
      setStage("idle");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStage("error");
    }
  }, [address, publicClient, negRisk]);

  useEffect(() => {
    if (!open || !address) return;
    void refreshChainState();
  }, [open, address, refreshChainState]);

  // ── action handlers ────────────────────────────────────────────────────────

  const ensureChain = async () => {
    if (chainId !== polygonMainnet.id) {
      await switchChainAsync({ chainId: polygonMainnet.id });
    }
  };

  const handleApprove = async () => {
    if (!walletClient || !publicClient || !address || !approvals) return;
    setStage("approving");
    setErrorMsg(null);
    try {
      await ensureChain();
      await ensureApprovals({
        walletClient,
        publicClient,
        owner: address,
        negRisk,
        status: approvals,
        onStep: (label) => setApproveLog(label),
      });
      await refreshChainState();
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStage("error");
    }
  };

  const handleSubmit = async () => {
    if (!walletClient || !publicClient || !address) return;
    if (!tokenId) {
      setErrorMsg("This market has no CLOB token id (not tradeable).");
      setStage("error");
      return;
    }
    if (!(sizeUsd >= MIN_USDC)) {
      setErrorMsg(`Minimum order size is ${MIN_USDC} USDC.`);
      setStage("error");
      return;
    }
    if (!usdceBal || usdceBal < BigInt(Math.ceil(sizeUsd * 1e6))) {
      setErrorMsg("Insufficient USDC.e balance.");
      setStage("error");
      return;
    }
    if (!polBal || polBal === 0n) {
      setErrorMsg("Need a tiny bit of POL for gas — bridge or top up.");
      setStage("error");
      return;
    }
    if (!approvals?.allReady) {
      setErrorMsg("Approvals are not set yet.");
      setStage("error");
      return;
    }

    setErrorMsg(null);

    // Step 1: ensure L2 creds (cached after first time)
    let creds = loadCachedCreds(address);
    if (!creds) {
      setStage("authing");
      try {
        await ensureChain();
        creds = await deriveOrLoadCreds(walletClient, address);
      } catch (e) {
        setErrorMsg(`Auth failed: ${(e as Error).message}`);
        setStage("error");
        return;
      }
    }

    // Step 2: sign the order
    setStage("signing");
    let signed;
    try {
      await ensureChain();
      signed = await buildAndSignBuyOrder({
        walletClient,
        owner: address,
        tokenId,
        side,
        price: limitPrice,
        sizeUsd,
        negRisk,
      });
    } catch (e) {
      setErrorMsg(`Sign failed: ${(e as Error).message}`);
      setStage("error");
      return;
    }

    // Step 3: POST to /api/trade/place (Vercel HKG → Polymarket CLOB)
    setStage("submitting");
    try {
      const res = await fetch("/api/trade/place", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creds,
          order: signed,
          owner: address,
          orderType: "GTC",
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        result?: { orderId?: string; orderID?: string; status?: string };
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `submit ${res.status}`);
      }
      const id =
        json.result?.orderId ||
        json.result?.orderID ||
        "(no order id returned)";
      setOrderId(id);
      setStage("done");
    } catch (e) {
      setErrorMsg(`Submit failed: ${(e as Error).message}`);
      setStage("error");
    }
  };

  // ── derived UI flags ───────────────────────────────────────────────────────
  const haveBalance = usdceBal !== null && usdceBal >= BigInt(Math.ceil(sizeUsd * 1e6));
  const haveGas = polBal !== null && polBal > 0n;
  const needApprove = approvals !== null && !approvals.allReady;
  const busy =
    stage === "checking" ||
    stage === "approving" ||
    stage === "authing" ||
    stage === "signing" ||
    stage === "submitting";

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card-strong relative w-full max-w-md rounded-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-foreground-dim hover:text-white transition-colors"
          aria-label="close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-foreground-dim">
            Place order on Polymarket
          </div>
          <div className="text-lg font-semibold leading-tight line-clamp-2">
            {market.question}
          </div>
        </div>

        {/* ── Side toggle ───────────────────────────────────────────────── */}
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
                  !active && "border-border text-foreground-muted hover:border-white/30",
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

        {/* ── Amount input ──────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="text-xs text-foreground-dim flex items-center justify-between">
            <span>Amount (USDC.e)</span>
            {verdict?.suggestedSizeUsd ? (
              <span className="text-[11px]">AI suggests {formatUsd(aiSize)}</span>
            ) : null}
          </label>
          <div className="relative">
            <input
              type="number"
              min={MIN_USDC}
              step="0.01"
              value={sizeStr}
              onChange={(e) => setSizeStr(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-border bg-black/30 px-4 py-3 text-base outline-none focus:border-accent/60 disabled:opacity-50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground-dim">
              USDC
            </span>
          </div>
          <div className="text-[11px] text-foreground-dim">
            ≈ {shareEstimate.toFixed(4)} {side} shares @ ${limitPrice.toFixed(2)}
          </div>
        </div>

        {/* ── Wallet status panel ───────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-black/20 p-3 space-y-1.5 text-xs">
          <Row
            label="USDC.e balance"
            value={usdceBal === null ? "…" : `${formatUnits(usdceBal, 6)} USDC.e`}
            ok={haveBalance}
          />
          <Row
            label="POL (gas)"
            value={polBal === null ? "…" : `${parseFloat(formatUnits(polBal, 18)).toFixed(4)} POL`}
            ok={haveGas}
          />
          <Row
            label="Approvals"
            value={
              approvals === null
                ? "…"
                : approvals.allReady
                  ? "ready"
                  : "needs setup"
            }
            ok={!!approvals?.allReady}
          />
        </div>

        {/* ── Action button(s) ──────────────────────────────────────────── */}
        {needApprove ? (
          <button
            type="button"
            onClick={handleApprove}
            disabled={busy || !walletClient}
            className="neon-button h-12 w-full"
          >
            {stage === "approving" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{approveLog || "Approving…"}</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                <span>Set approvals (one-time)</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              busy ||
              !walletClient ||
              !haveBalance ||
              !haveGas ||
              stage === "done" ||
              !tokenId
            }
            className={cn(
              "neon-button h-12 w-full",
              side === "NO" && "bg-no/80 hover:bg-no",
            )}
          >
            {stage === "authing" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Authorizing API key…</span>
              </>
            ) : stage === "signing" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sign order in wallet…</span>
              </>
            ) : stage === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Submitting to Polymarket…</span>
              </>
            ) : stage === "done" ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Order placed</span>
              </>
            ) : (
              <span>Place {side} order · {formatUsd(sizeUsd)}</span>
            )}
          </button>
        )}

        {/* ── Result / error ────────────────────────────────────────────── */}
        {stage === "done" && orderId ? (
          <div className="rounded-lg border border-yes/30 bg-yes-soft p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-yes font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Submitted to Polymarket CLOB
            </div>
            <div className="text-foreground-muted">
              Order id: <span className="font-mono">{shortHash(orderId, 8, 6)}</span>
            </div>
            <a
              href={`https://polymarket.com/event/${market.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              View on Polymarket <ExternalLink className="h-3 w-3" />
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
          Order is signed locally and relayed via Vercel HKG → Polymarket CLOB.
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-foreground-dim">{label}</span>
      <span className={cn("font-mono", ok ? "text-yes" : "text-foreground-muted")}>
        {value}
      </span>
    </div>
  );
}
