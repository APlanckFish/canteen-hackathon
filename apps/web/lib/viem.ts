import { createPublicClient, http, type PublicClient } from "viem";
import { arcTestnet, polygonMainnet } from "./chains";
import { publicEnv } from "./env";

/**
 * Singleton viem PublicClient instances reused across API routes.
 * Avoid recreating per-request — keeps connection pools warm.
 *
 * Server-side prefers `ARC_RPC_URL` (e.g. Canteen private RPC with token)
 * over the public NEXT_PUBLIC_ARC_RPC_URL, so the private token never
 * leaks into the client bundle.
 */
let _arcClient: PublicClient | undefined;
let _polygonClient: PublicClient | undefined;

export function getArcClient(): PublicClient {
  if (!_arcClient) {
    const serverRpc =
      typeof window === "undefined" ? process.env.ARC_RPC_URL : undefined;
    const rpc = serverRpc || publicEnv.NEXT_PUBLIC_ARC_RPC_URL;
    _arcClient = createPublicClient({
      chain: arcTestnet,
      transport: http(rpc),
    });
  }
  return _arcClient;
}

export function getPolygonClient(): PublicClient {
  if (!_polygonClient) {
    _polygonClient = createPublicClient({
      chain: polygonMainnet,
      transport: http(publicEnv.NEXT_PUBLIC_POLYGON_RPC_URL),
    });
  }
  return _polygonClient;
}
