import { NextResponse } from "next/server";
import { getCuratedMarkets } from "@/lib/ai/topic-curator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCuratedMarkets();
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    // IMPORTANT: never pass raw `e` to console.error — some upstream errors
    // (zod ZodError, undici cause chain, etc.) carry getters that crash
    // Node's util.inspect with "Cannot read properties of undefined".
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error && e.stack ? e.stack : "";
    console.error("[/api/markets/hot] " + msg + "\n" + stack);
    return NextResponse.json(
      {
        ok: false,
        code: "MARKETS_FETCH_FAILED",
        message: msg,
        picks: [],
        all: [],
      },
      { status: 200 }, // soft fail to keep UI responsive
    );
  }
}
