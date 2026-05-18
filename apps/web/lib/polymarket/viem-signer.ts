/**
 * Adapter: turn a viem WalletClient into something the Polymarket
 * @polymarket/clob-client SDK can use as a `signer`.
 *
 * What the SDK actually needs from the signer:
 *   - `getAddress()`  -> Promise<string>
 *   - `_signTypedData(domain, types, value)` -> Promise<string>   (ethers v5 style)
 *   - `signMessage(message)` -> Promise<string>                   (used for L1 auth)
 *
 * That's it. We don't need a full ethers Wallet.
 *
 * The SDK does NOT expose a public TypeScript interface called "Signer", but
 * it duck-types whatever you pass against the three methods above. As long
 * as our adapter exposes those three, the SDK is happy.
 */

import type { WalletClient } from "viem";

export interface ViemSdkSigner {
  getAddress(): Promise<string>;
  signMessage(message: string | { raw: Uint8Array }): Promise<string>;
  _signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, { name: string; type: string }[]>,
    value: Record<string, unknown>,
  ): Promise<string>;
}

/**
 * Build a SDK-compatible signer backed by a connected viem WalletClient.
 * The wallet popup will appear once for L1 auth (deriveApiKey), and again
 * each time createOrder is called (EIP-712 order signing).
 */
export function makeViemSdkSigner(
  walletClient: WalletClient,
  owner: `0x${string}`,
): ViemSdkSigner {
  return {
    async getAddress() {
      return owner;
    },

    async signMessage(message) {
      // The SDK calls signer.signMessage(messageString) for the L1 nonce.
      const m =
        typeof message === "string"
          ? message
          : { raw: message.raw };
      return await walletClient.signMessage({
        account: owner,
        message: m,
      });
    },

    async _signTypedData(domain, types, value) {
      // The SDK passes ethers-style args. ethers v5 conventionally OMITS the
      // EIP712Domain entry from `types`, and viem does NOT want it either —
      // so we forward as-is. If the SDK ever starts injecting it, viem will
      // throw, and we'll need to delete `types.EIP712Domain` here.
      // primaryType is inferred from the keys of `types` (the only one).
      const primaryType = Object.keys(types).find((k) => k !== "EIP712Domain");
      if (!primaryType) {
        throw new Error("makeViemSdkSigner: no primary type in EIP-712 schema");
      }
      // Strip EIP712Domain if the SDK happens to pass it (defensive).
      // viem's signTypedData rejects an extra "EIP712Domain" key.
      const cleanTypes: Record<string, { name: string; type: string }[]> = {};
      for (const [k, v] of Object.entries(types)) {
        if (k !== "EIP712Domain") cleanTypes[k] = v;
      }
      return await walletClient.signTypedData({
        account: owner,
        // viem's domain type is narrower; the SDK sends the standard fields.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        domain: domain as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        types: cleanTypes as any,
        primaryType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        message: value as any,
      });
    },
  };
}
