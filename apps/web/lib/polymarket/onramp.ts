/**
 * USDC.e → pUSD wrapping via Polymarket's CollateralOnramp.
 *
 * Polymarket V2 uses pUSD as the native collateral. Users with USDC.e on
 * Polygon must first wrap it 1:1 into pUSD before the funds can be used to
 * back CLOB orders. The wrap is done via a single contract call:
 *
 *   USDC.e.approve(CollateralOnramp, amount)
 *   CollateralOnramp.wrap(USDC.e, recipient, amount)
 *
 * Function signature confirmed from on-chain tx data:
 *   wrap(address tokenIn, address recipient, uint256 amount)  [selector 0x62355638]
 *
 * pUSD has 6 decimals (same as USDC.e), and conversion is 1:1.
 */

import { erc20Abi, maxUint256 } from "viem";
import type { PublicClient, WalletClient } from "viem";
import {
  COLLATERAL_ONRAMP,
  PUSD_ADDRESS,
  USDCE_ADDRESS,
} from "./constants";

const APPROVAL_THRESHOLD = maxUint256 / 2n;

/** Onramp ABI: just the one method we need. */
const ONRAMP_ABI = [
  {
    type: "function",
    name: "wrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/** pUSD balance reader (6 decimals, same as USDC.e). */
export async function readPusdBalance(
  publicClient: PublicClient,
  owner: `0x${string}`,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: PUSD_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

/** Read USDC.e → CollateralOnramp allowance. */
export async function readUsdceOnrampAllowance(
  publicClient: PublicClient,
  owner: `0x${string}`,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: USDCE_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, COLLATERAL_ONRAMP],
  })) as bigint;
}

/** Whether the USDC.e → Onramp allowance is "infinite enough". */
export function isOnrampApproved(allowance: bigint): boolean {
  return allowance >= APPROVAL_THRESHOLD;
}

/**
 * Approve USDC.e → CollateralOnramp with MaxUint256 (one-time setup).
 * Returns the tx hash.
 */
export async function approveUsdceForOnramp(args: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  owner: `0x${string}`;
}): Promise<`0x${string}`> {
  const { walletClient, publicClient, owner } = args;
  const hash = await walletClient.writeContract({
    account: owner,
    chain: walletClient.chain,
    address: USDCE_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [COLLATERAL_ONRAMP, maxUint256],
  });
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return hash;
}

/**
 * Wrap `amount` USDC.e → pUSD, with `recipient` receiving the pUSD.
 * Caller must have approved USDC.e → Onramp first (use `approveUsdceForOnramp`).
 *
 * Both USDC.e and pUSD are 6-decimal — `amount` is in raw 6-decimal units.
 */
export async function wrapUsdceToPusd(args: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  owner: `0x${string}`;
  /** Where the resulting pUSD is sent (typically the EOA itself). */
  recipient: `0x${string}`;
  /** Raw amount in 6-decimal units (e.g. 1_000_000n = 1 USDC). */
  amount: bigint;
}): Promise<`0x${string}`> {
  const { walletClient, publicClient, owner, recipient, amount } = args;
  const hash = await walletClient.writeContract({
    account: owner,
    chain: walletClient.chain,
    address: COLLATERAL_ONRAMP,
    abi: ONRAMP_ABI,
    functionName: "wrap",
    args: [USDCE_ADDRESS, recipient, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return hash;
}
