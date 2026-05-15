import { defineChain } from "viem";
import { polygon } from "viem/chains";

/**
 * Arc Testnet — Circle's modular L2 testnet used for x402 settlement.
 * Final RPC / chainId injected via env at runtime; defaults below are placeholders.
 */
export const arcTestnet = defineChain({
  id: 421614, // placeholder — override via NEXT_PUBLIC_ARC_CHAIN_ID
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://arc-testnet.example/rpc"] },
    public: { http: ["https://arc-testnet.example/rpc"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc-testnet.example" },
  },
  testnet: true,
});

export const polygonMainnet = polygon;

export interface ChainEnvOverride {
  id?: number;
  rpcUrl?: string;
}

export function buildArcChain(override: ChainEnvOverride) {
  return {
    ...arcTestnet,
    id: override.id ?? arcTestnet.id,
    rpcUrls: override.rpcUrl
      ? {
          default: { http: [override.rpcUrl] },
          public: { http: [override.rpcUrl] },
        }
      : arcTestnet.rpcUrls,
  } as typeof arcTestnet;
}

export const SUPPORTED_CHAINS = {
  arc: arcTestnet,
  polygon: polygonMainnet,
} as const;
