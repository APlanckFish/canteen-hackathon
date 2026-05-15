import { NextResponse } from "next/server";
import { fetchMarketById } from "@/lib/polymarket/gamma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const market = await fetchMarketById(params.id);
    if (!market) {
      return NextResponse.json(
        { ok: false, code: "MARKET_NOT_FOUND", message: "Not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, market });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error && e.stack ? e.stack : "";
    console.error("[/api/markets/[id]] " + msg + "\n" + stack);
    return NextResponse.json(
      { ok: false, code: "MARKET_FETCH_FAILED", message: msg },
      { status: 502 },
    );
  }
}
