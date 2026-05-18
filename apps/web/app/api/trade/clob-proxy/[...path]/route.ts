/**
 * Transparent reverse proxy for Polymarket CLOB.
 *
 * Why we need this:
 *   The official @polymarket/clob-client SDK uses axios under the hood, which
 *   in a browser runs straight into:
 *     a) CORS — Polymarket CLOB doesn't allow cross-origin requests, AND
 *     b) Geographic IP blocks (US / sanctioned regions).
 *
 *   By pointing ClobClient at OUR_ORIGIN/api/trade/clob-proxy and proxying
 *   every request to clob.polymarket.com from a Vercel Edge function in
 *   region "hkg1" (Hong Kong), we:
 *     1. Eliminate CORS (same-origin from browser's POV).
 *     2. Bypass the US-IP block (request originates from HKG, not user's IP).
 *     3. Keep the SDK's payload format / HMAC headers / signing untouched.
 *
 * This is a thin, dumb forwarder — every method, header, query string, body
 * is passed through unchanged. The SDK does all the heavy lifting client-side.
 */

import { CLOB_HOST } from "@/lib/polymarket/constants";

export const runtime = "edge";
export const preferredRegion = ["hkg1"];

/**
 * Headers we MUST forward to Polymarket. Everything else (host, origin,
 * referer, etc.) we strip — they leak the user's origin and cause
 * inconsistent behavior on the upstream.
 */
const FORWARD_HEADER_ALLOWLIST = new Set([
  "content-type",
  "accept",
  "accept-encoding",
  // Polymarket L1 / L2 auth headers
  "poly_address",
  "poly_signature",
  "poly_timestamp",
  "poly_api_key",
  "poly_passphrase",
  "poly_nonce",
]);

async function handle(
  req: Request,
  { params }: { params: { path?: string[] } },
): Promise<Response> {
  const segs = params.path ?? [];
  const search = new URL(req.url).search;
  const upstreamUrl = `${CLOB_HOST}/${segs.join("/")}${search}`;

  // ── build outgoing headers ────────────────────────────────────────────────
  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    if (FORWARD_HEADER_ALLOWLIST.has(k.toLowerCase())) {
      headers.set(k, v);
    }
  }

  // ── body: pass through verbatim for non-GET/HEAD ──────────────────────────
  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      // Don't auto-redirect — we want to surface 3xx to the SDK as-is.
      redirect: "manual",
    });
  } catch (e) {
    console.error(
      `[clob-proxy] fetch failed ${req.method} ${upstreamUrl}: ${(e as Error).message}`,
    );
    return new Response(
      JSON.stringify({
        ok: false,
        error: `clob-proxy upstream failed: ${(e as Error).message}`,
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  // ── log non-2xx upstream responses for debugging ──────────────────────────
  // (Visible in `vercel logs` / Vercel dashboard → Functions tab.)
  if (upstream.status >= 400) {
    const text = await upstream.clone().text().catch(() => "");
    console.warn(
      `[clob-proxy] ${req.method} ${segs.join("/")} → ${upstream.status} :: ${text.slice(0, 400)}`,
    );
  }

  // ── return upstream response unchanged ────────────────────────────────────
  // Strip transfer-encoding because the runtime injects its own.
  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    respHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
