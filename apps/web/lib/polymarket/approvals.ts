/**
 * Polymarket V2 trading prerequisites: pUSD allowance + ERC1155 CTF
 * isApprovedForAll. Both must be set before the V2 Exchange can transfer
 * collateral / shares on the user's behalf.
 *
 * Spenders that need approval (per V2 docs + V2 SDK contract config):
 *   - Standard markets: V2 CTFExchange (0xE111180000d2663C...)
 *   - NegRisk markets:  V2 NegRiskCTFExchange (0xe2222d279d7440...) + NegRiskAdapter
 *
 * NOTE: V2 collateral is pUSD, NOT USDC.e. Users must first wrap USDC.e →
 * pUSD via CollateralOnramp before they can back orders. See `onramp.ts`.
 *
 * We over-approve once with MaxUint256 — same pattern Polymarket UI uses.
 */

import { erc20Abi, type PublicClient, type WalletClient } from "viem";
import { maxUint256 } from "viem";
import {
  CTF_ADDRESS,
  CTF_EXCHANGE,
  NEG_RISK_ADAPTER,
  NEG_RISK_CTF_EXCHANGE,
  PUSD_ADDRESS,
  USDCE_ADDRESS,
} from "./constants";

/** Minimal ABI for ERC1155 approval (CTF outcome shares). */
const ctfApprovalAbi = [
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

export interface ApprovalStatus {
  /** pUSD allowance from owner → V2 CTFExchange (or V2 NegRiskCTFExchange). */
  pusdForExchange: boolean;
  /** pUSD allowance from owner → NegRiskAdapter (only for NegRisk markets). */
  pusdForNegRiskAdapter?: boolean;
  /** CTF setApprovalForAll(owner, exchange). */
  ctfForExchange: boolean;
  /** CTF setApprovalForAll(owner, negRiskAdapter) — only for NegRisk. */
  ctfForNegRiskAdapter?: boolean;
  /** Convenience: true iff every required approval is set. */
  allReady: boolean;
  /** Raw allowances exposed for diagnostic / "is this enough for X order" checks. */
  rawPusdForExchange: bigint;
  rawPusdForNegRiskAdapter?: bigint;
}

/**
 * "Approval is enough" threshold. We deliberately do NOT require maxUint256:
 * many wallets (OKX, MetaMask "smart approve", Rabby, etc.) silently rewrite
 * approvals to "current balance" or a small custom amount even when the dApp
 * asked for unlimited. So we only require enough headroom to cover the order
 * amount the user is about to place. The runtime check inside the dialog
 * recalculates this against `requiredPusd` to get the real "is it enough"
 * answer per-order.
 *
 * 1 pUSD (= 1e6 raw) is a safe-enough lower bound for "feels approved" —
 * anything below this means the user almost certainly needs to re-approve.
 */
const APPROVAL_MIN_FLOOR = 1_000_000n; // 1 pUSD

/**
 * Read all required approvals for `funder`. NegRisk markets require two
 * extra approvals (pUSD → NegRiskAdapter, CTF → NegRiskAdapter).
 *
 * `funder` is whoever holds the pUSD and CTF shares — equals the EOA in
 * EOA mode, or the proxy/safe address in proxy modes.
 */
export async function readApprovalStatus(
  publicClient: PublicClient,
  funder: `0x${string}`,
  negRisk: boolean,
): Promise<ApprovalStatus> {
  const exchange = negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE;

  const [pusdAllow, ctfApproved] = await Promise.all([
    publicClient.readContract({
      address: PUSD_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [funder, exchange],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: CTF_ADDRESS,
      abi: ctfApprovalAbi,
      functionName: "isApprovedForAll",
      args: [funder, exchange],
    }) as Promise<boolean>,
  ]);

  const status: ApprovalStatus = {
    pusdForExchange: pusdAllow >= APPROVAL_MIN_FLOOR,
    ctfForExchange: ctfApproved === true,
    rawPusdForExchange: pusdAllow,
    allReady: false,
  };

  if (negRisk) {
    const [pusdAllowNeg, ctfApprovedNeg] = await Promise.all([
      publicClient.readContract({
        address: PUSD_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [funder, NEG_RISK_ADAPTER],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: CTF_ADDRESS,
        abi: ctfApprovalAbi,
        functionName: "isApprovedForAll",
        args: [funder, NEG_RISK_ADAPTER],
      }) as Promise<boolean>,
    ]);
    status.pusdForNegRiskAdapter = pusdAllowNeg >= APPROVAL_MIN_FLOOR;
    status.ctfForNegRiskAdapter = ctfApprovedNeg === true;
    status.rawPusdForNegRiskAdapter = pusdAllowNeg;
  }

  status.allReady =
    status.pusdForExchange &&
    status.ctfForExchange &&
    (!negRisk ||
      (status.pusdForNegRiskAdapter === true &&
        status.ctfForNegRiskAdapter === true));

  return status;
}

/**
 * Check whether the existing approvals are large enough to back a specific
 * order size. Wallets often clamp the "unlimited" approval to small numbers,
 * so even an `allReady=true` status may not cover the real order amount.
 *
 * Returns null if everything is fine, or a human-readable error message
 * otherwise.
 */
export function checkApprovalsCoverOrder(
  status: ApprovalStatus,
  requiredPusd6: bigint,
  negRisk: boolean,
): string | null {
  if (!status.ctfForExchange) return "CTF approval missing for Exchange";
  if (negRisk && !status.ctfForNegRiskAdapter)
    return "CTF approval missing for NegRiskAdapter";
  if (status.rawPusdForExchange < requiredPusd6) {
    return (
      `pUSD allowance for Exchange is too low: ${status.rawPusdForExchange} < ${requiredPusd6}. ` +
      `Wallets sometimes clamp "unlimited" approvals — please re-approve and choose Max/Unlimited in your wallet popup.`
    );
  }
  if (
    negRisk &&
    (status.rawPusdForNegRiskAdapter ?? 0n) < requiredPusd6
  ) {
    return (
      `pUSD allowance for NegRiskAdapter is too low: ${status.rawPusdForNegRiskAdapter ?? 0n} < ${requiredPusd6}. ` +
      `Please re-approve with Max/Unlimited.`
    );
  }
  return null;
}

/**
 * Send approval txs for whatever is missing. Each missing approval triggers
 * a separate wallet popup (4 max for negRisk, 2 max for standard).
 *
 * Caller is expected to await the underlying receipts — we already do so
 * inline so the next read sees fresh state.
 */
export async function ensureApprovals(args: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  owner: `0x${string}`;
  negRisk: boolean;
  status: ApprovalStatus;
  /** Per-tx callback so the UI can advance a stepper. */
  onStep?: (label: string) => void;
}): Promise<`0x${string}`[]> {
  const { walletClient, publicClient, owner, negRisk, status, onStep } = args;
  const exchange = negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE;
  const txs: `0x${string}`[] = [];

  if (!status.pusdForExchange) {
    onStep?.("Approving pUSD for CTF Exchange…");
    const hash = await walletClient.writeContract({
      account: owner,
      chain: walletClient.chain,
      address: PUSD_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [exchange, maxUint256],
    });
    txs.push(hash);
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  }

  if (negRisk && !status.pusdForNegRiskAdapter) {
    onStep?.("Approving pUSD for NegRisk Adapter…");
    const hash = await walletClient.writeContract({
      account: owner,
      chain: walletClient.chain,
      address: PUSD_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [NEG_RISK_ADAPTER, maxUint256],
    });
    txs.push(hash);
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  }

  if (!status.ctfForExchange) {
    onStep?.("Approving CTF shares for Exchange…");
    const hash = await walletClient.writeContract({
      account: owner,
      chain: walletClient.chain,
      address: CTF_ADDRESS,
      abi: ctfApprovalAbi,
      functionName: "setApprovalForAll",
      args: [exchange, true],
    });
    txs.push(hash);
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  }

  if (negRisk && !status.ctfForNegRiskAdapter) {
    onStep?.("Approving CTF shares for NegRisk Adapter…");
    const hash = await walletClient.writeContract({
      account: owner,
      chain: walletClient.chain,
      address: CTF_ADDRESS,
      abi: ctfApprovalAbi,
      functionName: "setApprovalForAll",
      args: [NEG_RISK_ADAPTER, true],
    });
    txs.push(hash);
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  }

  return txs;
}

/** USDC.e balance reader (6 decimals). Kept for diagnostic UI only. */
export async function readUsdceBalance(
  publicClient: PublicClient,
  owner: `0x${string}`,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: USDCE_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

/** Native POL/MATIC balance reader (18 decimals). */
export async function readPolBalance(
  publicClient: PublicClient,
  owner: `0x${string}`,
): Promise<bigint> {
  return await publicClient.getBalance({ address: owner });
}
