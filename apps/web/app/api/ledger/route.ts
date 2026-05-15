import { NextResponse } from "next/server";
import { getLedger } from "@/lib/tikhub/settler";

export const runtime = "nodejs";

/**
 * Read-only endpoint to inspect a ledger entry by txHash. Useful for the
 * Portfolio page and for the demo "async settle" narrative.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tx = url.searchParams.get("tx");
  if (!tx) {
    return NextResponse.json(
      { ok: false, code: "MISSING_TX", message: "tx query param required" },
      { status: 400 },
    );
  }
  const entry = await getLedger(tx);
  return NextResponse.json({ ok: true, entry });
}
