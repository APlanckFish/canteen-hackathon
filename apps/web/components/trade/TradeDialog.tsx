"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatUnits } from "viem";
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
  ExternalLink,
  Loader2,
  ShieldCheck,
  Wallet,
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
import { useT } from "@/lib/i18n/provider";

type Stage =
  | "idle"
  | "checking"
  | "switchingChain"
  | "approving"
  | "authing"
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

const MIN_USDC = 0.01;
const DEFAULT_YES_PRICE = 0.5;

export function TradeDialog({ open, onClose, market, verdict }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: polygonMainnet.id });
  const config = useConfig();
  const { t } = useT();

  // Default side picker:
  //   1. AI gave a clear verdict (YES/NO) → respect it.
  //   2. AI said SKIP or no verdict → fall back to the market's current
  //      majority probability (e.g. yesProb=5% → default NO, yesProb=80% → YES).
  // This way the dialog always opens to the side the user is most likely
  // wanting to trade, removing one click for the common case.
  const aiSide: TradeSide = useMemo(() => {
    if (verdict?.suggestedSide === "YES") return "YES";
    if (verdict?.suggestedSide === "NO") return "NO";
    // SKIP or undefined → use market consensus
    return (market.yesProb ?? 0.5) >= 0.5 ? "YES" : "NO";
  }, [verdict?.suggestedSide, market.yesProb]);
  const aiSize = Math.max(MIN_USDC, verdict?.suggestedSizeUsd ?? 1);

  const [side, setSide] = useState<TradeSide>(aiSide);
  const [sizeStr, setSizeStr] = useState(aiSize.toFixed(2));
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approveLog, setApproveLog] = useState<string>("");
  const [orderId, setOrderId] = useState<string | null>(null);

  const [usdceBal, setUsdceBal] = useState<bigint | null>(null);
  const [polBal, setPolBal] = useState<bigint | null>(null);
  const [approvals, setApprovals] = useState<ApprovalStatus | null>(null);

  const tokenId = side === "YES" ? market.clobTokenIds?.yes : market.clobTokenIds?.no;
  const negRisk = market.negRisk === true;

  const limitPrice = useMemo(() => {
    const base = side === "YES" ? market.yesProb : 1 - market.yesProb;
    const clamped = Math.min(0.99, Math.max(0.01, base || DEFAULT_YES_PRICE));
    const tick = market.tickSize ?? 0.01;
    return Math.round(clamped / tick) * tick;
  }, [market.yesProb, market.tickSize, side]);

  const sizeUsd = parseFloat(sizeStr || "0");
  const shareEstimate = limitPrice > 0 ? sizeUsd / limitPrice : 0;

  // ── reset on open ──────────────────────────────────────────────────────────
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

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Ensure wallet is on Polygon AND fetch a wallet client lazily — the
   * `useWalletClient` hook returns undefined when chain is wrong, which was
   * the cause of the disabled CTA in the previous version.
   */
  const ensureChainAndWallet = async () => {
    if (chainId !== polygonMainnet.id) {
      setStage("switchingChain");
      await switchChainAsync({ chainId: polygonMainnet.id });
    }
    const wc = await getWalletClient(config, { chainId: polygonMainnet.id });
    if (!wc) throw new Error("Wallet not connected on Polygon");
    return wc;
  };

  const handleApprove = async () => {
    if (!publicClient || !address || !approvals) return;
    setErrorMsg(null);
    try {
      const wc = await ensureChainAndWallet();
      setStage("approving");
      await ensureApprovals({
        walletClient: wc,
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
    if (!publicClient || !address) return;
    if (!tokenId) return setErr(t("td.err.noTokenId"));
    if (!(sizeUsd >= MIN_USDC))
      return setErr(t("td.err.tooSmall", { min: MIN_USDC }));
    if (!usdceBal || usdceBal < BigInt(Math.ceil(sizeUsd * 1e6)))
      return setErr(t("td.err.noBalance"));
    if (!polBal || polBal === 0n) return setErr(t("td.err.noGas"));
    if (!approvals?.allReady) return setErr(t("td.err.notApproved"));

    setErrorMsg(null);

    let wc;
    try {
      wc = await ensureChainAndWallet();
    } catch (e) {
      return setErr((e as Error).message);
    }

    // L2 creds (1 wallet popup if first time)
    let creds = loadCachedCreds(address);
    if (!creds) {
      setStage("authing");
      try {
        creds = await deriveOrLoadCreds(wc, address);
      } catch (e) {
        return setErr(t("td.err.authFailed", { msg: (e as Error).message }));
      }
    }

    // Order signing (1 wallet popup)
    setStage("signing");
    let signed;
    try {
      signed = await buildAndSignBuyOrder({
        walletClient: wc,
        owner: address,
        tokenId,
        side,
        price: limitPrice,
        sizeUsd,
        negRisk,
      });
    } catch (e) {
      return setErr(t("td.err.signFailed", { msg: (e as Error).message }));
    }

    // Submit
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
        result?: { orderId?: string; orderID?: string };
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `submit ${res.status}`);
      }
      const id =
        json.result?.orderId || json.result?.orderID || "(no id)";
      setOrderId(id);
      setStage("done");
    } catch (e) {
      return setErr(t("td.err.submitFailed", { msg: (e as Error).message }));
    }
  };

  const setErr = (msg: string) => {
    setErrorMsg(msg);
    setStage("error");
  };

  // ── derived flags ──────────────────────────────────────────────────────────
  const onPolygon = chainId === polygonMainnet.id;
  const haveBalance =
    usdceBal !== null && usdceBal >= BigInt(Math.ceil(sizeUsd * 1e6));
  const haveGas = polBal !== null && polBal > 0n;
  const needApprove = approvals !== null && !approvals.allReady;
  // Important: only use `busy` to disable the CTA, NOT the wrong-chain state
  // (which the CTA itself handles by switching).
  const busy =
    stage === "checking" ||
    stage === "switchingChain" ||
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

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-foreground-dim">
            {t("td.title")}
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
            {t("td.amount.shareEstimate", {
              shares: shareEstimate.toFixed(4),
              side,
              price: limitPrice.toFixed(2),
            })}
          </div>
        </div>

        {/* ── Wallet status ──────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-black/20 p-3 space-y-1.5 text-xs">
          <Row
            label={t("td.row.usdce")}
            value={
              usdceBal === null ? "…" : `${formatUnits(usdceBal, 6)} USDC.e`
            }
            ok={haveBalance}
          />
          <Row
            label={t("td.row.pol")}
            value={
              polBal === null
                ? "…"
                : `${parseFloat(formatUnits(polBal, 18)).toFixed(4)} POL`
            }
            ok={haveGas}
          />
          <Row
            label={t("td.row.approvals")}
            value={
              approvals === null
                ? "…"
                : approvals.allReady
                  ? t("td.approvals.ready")
                  : t("td.approvals.needSetup")
            }
            ok={!!approvals?.allReady}
          />
        </div>

        {/* ── Action button ──────────────────────────────────────────────── */}
        {/*
          Single-button strategy. The button text & action change based on the
          current state — we DON'T disable it for chain-mismatch (clicking will
          switch chain). Disabling is only used during in-flight async work.
        */}
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
        ) : needApprove ? (
          <button
            type="button"
            onClick={handleApprove}
            disabled={busy}
            className="neon-button h-12 w-full"
          >
            {stage === "approving" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{approveLog || t("td.cta.approving")}</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                <span>{t("td.cta.setApprovals")}</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              busy ||
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
                <span>{t("td.cta.authing")}</span>
              </>
            ) : stage === "signing" ? (
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

        {/* ── Result ─────────────────────────────────────────────────────── */}
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
