/**
 * Polymarket L2 API-key derivation proxy.
 *
 * Why we proxy:
 *   Polymarket's CLOB host blocks requests from US IPs. Browsers in restricted
 *   regions also can't call it directly. By doing the round-trip from our
 *   Vercel Edge function (region: hkg1), the source IP is always Hong Kong,
 *   which CLOB allows.
 *
 * Auth contract (mirrors @polymarket/clob-client `createOrDeriveApiKey`):
 *   POST  https://clob.polymarket.com/auth/derive-api-key
 *   Headers:
 *     POLY_ADDRESS      : EOA
 *     POLY_SIGNATURE    : EIP-712 sig over the ClobAuthDomain message
 *     POLY_TIMESTAMP    : same timestamp the user signed
 *     POLY_NONCE        : same nonce the user signed (string)
 *
 * The server returns the already-existing creds if the wallet has signed up
 * before, otherwise creates new ones. We pass them straight back to the
 * browser, which caches in localStorage.
 */

import { NextResponse } from "next/server";
import { CLOB_HOST } from "@/lib/polymarket/constants";

export const runtime = "edge";
export const preferredRegion = ["hkg1"]; // bypass US IP block

interface Body {
  address: `0x${string}`;
  signature: `0x${string}`;
  timestamp: string;
  nonce: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid json" },
      { status: 400 },
    );
  }

  const { address, signature, timestamp, nonce } = body;
  if (!address || !signature || !timestamp || nonce === undefined) {
    return NextResponse.json(
      { ok: false, error: "missing fields" },
      { status: 400 },
    );
  }

  // Polymarket's CLOB endpoint for create-or-derive.
  // Path is `/auth/api-key` — POST creates (or returns the existing) creds.
  // The `/auth/derive-api-key` path returns 405 (does not exist).
  const upstream = `${CLOB_HOST}/auth/api-key`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        POLY_ADDRESS: address,
        POLY_SIGNATURE: signature,
        POLY_TIMESTAMP: timestamp,
        POLY_NONCE: nonce,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: `upstream fetch failed: ${(e as Error).message}`,
      },
      { status: 502 },
    );
  }

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        upstreamStatus: res.status,
        error: text.slice(0, 500),
      },
      { status: res.status },
    );
  }

  // CLOB sometimes returns the creds under different key names depending on
  // whether the key existed already. Normalize.
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(text) as Record<string, string>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "upstream returned non-json" },
      { status: 502 },
    );
  }

  // Possible shapes seen in the wild:
  //   { apiKey, secret, passphrase }
  //   { api_key, secret, passphrase }
  const apiKey = parsed.apiKey ?? parsed.api_key ?? "";
  const secret = parsed.secret ?? "";
  const passphrase = parsed.passphrase ?? "";

  if (!apiKey || !secret || !passphrase) {
    return NextResponse.json(
      {
        ok: false,
        error: "upstream missing apiKey/secret/passphrase",
        raw: text.slice(0, 300),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ apiKey, secret, passphrase });
}
