/**
 * Polymarket trading prerequisites: ERC20 USDC.e allowance + ERC1155 CTF
 * isApprovedForAll. Both must be set before the Exchange can transfer
 * collateral / shares on the user's behalf.
 *
 * Spenders that need approval (per Polymarket docs):
 *   - Standard markets: CTFExchange
 *   - NegRisk markets:  NegRiskCTFExchange + NegRiskAdapter
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
  /** USDC.e allowance from owner → CTFExchange (or NegRiskCTFExchange). */
  usdceForExchange: boolean;
  /** USDC.e allowance from owner → NegRiskAdapter (only for NegRisk markets). */
  usdceForNegRiskAdapter?: boolean;
  /** CTF setApprovalForAll(owner, exchange). */
  ctfForExchange: boolean;
  /** CTF setApprovalForAll(owner, negRiskAdapter) — only for NegRisk. */
  ctfForNegRiskAdapter?: boolean;
  /** Convenience: true iff every required approval is set. */
  allReady: boolean;
}

const APPROVAL_THRESHOLD = maxUint256 / 2n;

/**
 * Read all required approvals for `owner`. NegRisk markets require two extra
 * approvals (USDC.e → NegRiskAdapter, CTF → NegRiskAdapter).
 */
export async function readApprovalStatus(
  publicClient: PublicClient,
  owner: `0x${string}`,
  negRisk: boolean,
): Promise<ApprovalStatus> {
  const exchange = negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE;

  const [usdceAllow, ctfApproved] = await Promise.all([
    publicClient.readContract({
      address: USDCE_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, exchange],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: CTF_ADDRESS,
      abi: ctfApprovalAbi,
      functionName: "isApprovedForAll",
      args: [owner, exchange],
    }) as Promise<boolean>,
  ]);

  const status: ApprovalStatus = {
    usdceForExchange: usdceAllow >= APPROVAL_THRESHOLD,
    ctfForExchange: ctfApproved === true,
    allReady: false,
  };

  if (negRisk) {
    const [usdceAllowNeg, ctfApprovedNeg] = await Promise.all([
      publicClient.readContract({
        address: USDCE_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, NEG_RISK_ADAPTER],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: CTF_ADDRESS,
        abi: ctfApprovalAbi,
        functionName: "isApprovedForAll",
        args: [owner, NEG_RISK_ADAPTER],
      }) as Promise<boolean>,
    ]);
    status.usdceForNegRiskAdapter = usdceAllowNeg >= APPROVAL_THRESHOLD;
    status.ctfForNegRiskAdapter = ctfApprovedNeg === true;
  }

  status.allReady =
    status.usdceForExchange &&
    status.ctfForExchange &&
    (!negRisk ||
      (status.usdceForNegRiskAdapter === true &&
        status.ctfForNegRiskAdapter === true));

  return status;
}

/**
 * Send approval txs for whatever is missing. Each missing approval triggers
 * a separate wallet popup (4 max for negRisk, 2 max for standard).
 *
 * Caller is expected to await `publicClient.waitForTransactionReceipt` on
 * the returned hashes if it needs to ensure the next read sees them.
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

  if (!status.usdceForExchange) {
    onStep?.("Approving USDC.e for CTF Exchange…");
    const hash = await walletClient.writeContract({
      account: owner,
      chain: walletClient.chain,
      address: USDCE_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [exchange, maxUint256],
    });
    txs.push(hash);
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  }

  if (negRisk && !status.usdceForNegRiskAdapter) {
    onStep?.("Approving USDC.e for NegRisk Adapter…");
    const hash = await walletClient.writeContract({
      account: owner,
      chain: walletClient.chain,
      address: USDCE_ADDRESS,
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

/** USDC.e balance reader (6 decimals). */
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
