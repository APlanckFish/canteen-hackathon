/**
 * Polymarket order submission proxy.
 *
 *   Browser → POST /api/trade/place
 *           { creds: ClobApiCreds, order: SignedClobOrder, owner }
 *           ↓
 *   Vercel Edge HKG (this route)
 *           ↓ HMAC-sign the request, attach POLY_* headers
 *   POST https://clob.polymarket.com/order
 *           ↓
 *   { orderId, status, ... } / { error }
 *
 * The HMAC is computed here because the secret never needs to leave the
 * server-side once derived (we pass it via the request body, but it's also
 * stored client-side; Polymarket's design treats the secret as a session
 * token, not a long-lived secret).
 */

import { NextResponse } from "next/server";
import { CLOB_HOST } from "@/lib/polymarket/constants";
import { buildClobHmac } from "@/lib/polymarket/hmac";

export const runtime = "edge";
export const preferredRegion = ["hkg1"]; // dodge US IP block

interface Body {
  creds: {
    apiKey: string;
    secret: string;
    passphrase: string;
  };
  /**
   * Wire-format order from buildAndSignBuyOrder. Match the SignedClobOrder
   * type exactly — Polymarket validates strictly.
   */
  order: {
    salt: number;
    maker: string;
    signer: string;
    taker: string;
    tokenId: string;
    makerAmount: string;
    takerAmount: string;
    expiration: string;
    nonce: string;
    feeRateBps: string;
    side: "BUY" | "SELL";
    signatureType: number;
    signature: string;
  };
  owner: string;
  /**
   * Order type. "GTC" = good-till-canceled (default, can sit on the book).
   * Other values: "FOK" (fill-or-kill), "GTD" (good-till-date).
   */
  orderType?: "GTC" | "FOK" | "GTD";
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

  const { creds, order, owner, orderType = "GTC" } = body;
  if (!creds?.apiKey || !creds.secret || !creds.passphrase) {
    return NextResponse.json(
      { ok: false, error: "missing creds" },
      { status: 400 },
    );
  }
  if (!order?.signature || !order.tokenId) {
    return NextResponse.json(
      { ok: false, error: "missing order" },
      { status: 400 },
    );
  }

  const requestPath = "/order";
  const method = "POST";
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Polymarket expects the order wrapped in this envelope — must match
  // the `orderToJson` output in clob-client/utilities.ts:
  //   { deferExec, order, owner, orderType }
  // Missing `deferExec` → server returns "Invalid order payload".
  const upstreamBody = JSON.stringify({
    deferExec: false,
    order,
    owner,
    orderType,
  });

  let polySig: string;
  try {
    polySig = await buildClobHmac({
      secret: creds.secret,
      timestamp,
      method,
      requestPath,
      body: upstreamBody,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `hmac: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  let res: Response;
  try {
    res = await fetch(CLOB_HOST + requestPath, {
      method,
      headers: {
        "content-type": "application/json",
        POLY_ADDRESS: owner,
        POLY_SIGNATURE: polySig,
        POLY_TIMESTAMP: timestamp,
        POLY_API_KEY: creds.apiKey,
        POLY_PASSPHRASE: creds.passphrase,
      },
      body: upstreamBody,
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
        error: text.slice(0, 800),
      },
      { status: res.status },
    );
  }

  // Forward the upstream JSON as-is.
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { ok: false, error: "upstream returned non-json", raw: text.slice(0, 300) },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, result: json });
}
