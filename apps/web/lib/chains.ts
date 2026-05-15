import { defineChain } from "viem";
import { polygon } from "viem/chains";
import { publicEnv } from "./env";

// Hard-cast to ensure chainId is always a finite number, even if env parsing
// returned a string in some edge case. RainbowKit reads chain.id deeply; if it
// is undefined the modal throws "Cannot read properties of undefined (reading
// 'value')".
const ARC_CHAIN_ID = Number(publicEnv.NEXT_PUBLIC_ARC_CHAIN_ID) || 5042002;
const ARC_RPC =
  publicEnv.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";
const ARC_EXPLORER =
  publicEnv.NEXT_PUBLIC_ARC_EXPLORER_URL || "https://testnet.arcscan.app";

/**
 * Build runtime-resolved Arc Testnet chain. Uses env-injected RPC + chainId.
 * Block explorer points at the public Blockscout instance at arcscan.app —
 * override with NEXT_PUBLIC_ARC_EXPLORER_URL if Arc launches an official one.
 */
export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC] },
    public: { http: [ARC_RPC] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: ARC_EXPLORER },
  },
  testnet: true,
});

export const polygonMainnet = polygon;

export const ALL_CHAINS = [arcTestnet, polygonMainnet] as const;

/** Build the explorer URL for a tx on a given chain. */
export function buildTxUrl(chainId: number, txHash: string): string | null {
  if (chainId === arcTestnet.id) {
    return `${arcTestnet.blockExplorers.default.url}/tx/${txHash}`;
  }
  if (chainId === polygonMainnet.id) {
    return `https://polygonscan.com/tx/${txHash}`;
  }
  return null;
}

/** Default = Arc Testnet, since that's where x402 settlements happen. */
export function buildArcTxUrl(txHash: string): string {
  return `${arcTestnet.blockExplorers.default.url}/tx/${txHash}`;
}

/** Address page on Arc explorer. */
export function buildArcAddressUrl(address: string): string {
  return `${arcTestnet.blockExplorers.default.url}/address/${address}`;
}
