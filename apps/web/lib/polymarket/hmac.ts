/**
 * Polymarket L2 auth HMAC helper. Used by Vercel Edge routes to compute the
 * `POLY_SIGNATURE` header that authenticates requests to clob.polymarket.com.
 *
 * Algorithm (matches @polymarket/clob-client/src/headers.ts):
 *   message = `${timestamp}${method}${requestPath}${body ?? ""}`
 *   signature = base64url( HMAC_SHA256( base64Decode(secret), message ) )
 *
 * Web Crypto API is used so this runs on the Edge runtime.
 */

export async function buildClobHmac(params: {
  secret: string; // base64 (with possible URL-safe chars)
  timestamp: string;
  method: string;
  requestPath: string;
  body?: string;
}): Promise<string> {
  const { secret, timestamp, method, requestPath, body = "" } = params;
  const message = `${timestamp}${method}${requestPath}${body}`;

  // Polymarket uses base64url-encoded secret, sometimes with `-`/`_` chars.
  // Normalize to standard base64 before decoding.
  const normalized = secret.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const keyBytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );

  // base64url encode (no padding)
  const sigBytes = new Uint8Array(sig);
  let bin = "";
  for (const b of sigBytes) bin += String.fromCharCode(b);
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
