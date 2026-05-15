import {
  connectorsForWallets,
} from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  okxWallet,
  coinbaseWallet,
  rainbowWallet,
  walletConnectWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { publicEnv } from "./env";
import { arcTestnet, polygonMainnet } from "./chains";

/**
 * wagmi v2 + RainbowKit v2 config.
 *
 * We explicitly enumerate the wallet list (instead of `getDefaultConfig`) so
 * non-default wallets — most importantly **OKX Wallet (欧易钱包)** — show up
 * in the connect modal regardless of which extension wins the `window.ethereum`
 * race. Order here = order shown in the modal.
 *
 * NOTE: a real WalletConnect Cloud projectId is REQUIRED. Without it the
 * Connect modal throws "Cannot read properties of undefined (reading 'value')".
 * Get one (free) at https://cloud.walletconnect.com.
 */
const projectId = publicEnv.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
export const hasWalletConnect = projectId.length >= 8;
const safeProjectId = hasWalletConnect
  ? projectId
  : "00000000000000000000000000000000";

if (!hasWalletConnect && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "[wagmi] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is empty — WalletConnect / " +
      "OKX-via-WC will not work. Set it in apps/web/.env.local then restart `pnpm dev`.",
  );
}

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, okxWallet, coinbaseWallet, rainbowWallet],
    },
    {
      groupName: "Other",
      wallets: [walletConnectWallet, injectedWallet],
    },
  ],
  {
    appName: "Canteen Insight",
    projectId: safeProjectId,
  },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [arcTestnet, polygonMainnet],
  ssr: true,
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
    [polygonMainnet.id]: http(publicEnv.NEXT_PUBLIC_POLYGON_RPC_URL),
  },
});
