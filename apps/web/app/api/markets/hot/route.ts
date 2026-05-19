import { NextResponse } from "next/server";
import {
  getAiPicks,
  getCategoryPage,
  getCuratedMarkets,
} from "@/lib/ai/topic-curator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Two modes:
 *
 *   GET /api/markets/hot                  → initial payload {picks, all}
 *   GET /api/markets/hot?cat=&page=N      → category page only {items, nextPage}
 *
 * The "tab" → tag-slug mapping is performed here (not on the client) so the
 * client never has to know Polymarket's internal taxonomy.
 */
const TAB_TO_SLUG: Record<string, string | undefined> = {
  all: undefined,
  politics: "politics",
  crypto: "crypto",
  sports: "sports",
  // polymarket.com uses `pop-culture` as the canonical Entertainment slug
  entertainment: "pop-culture",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cat = (url.searchParams.get("cat") ?? "").toLowerCase();
  const pageStr = url.searchParams.get("page");

  try {
    // Paginated category fetch
    if (cat || pageStr) {
      const slug = TAB_TO_SLUG[cat] ?? (cat ? cat : undefined);
      const page = Math.max(0, parseInt(pageStr ?? "0", 10) || 0);
      const { items, nextPage } = await getCategoryPage({ slug, page });
      // When asking for page 0 of "All" we also include picks so the client
      // can render the AI rail without a separate round-trip on tab switch.
      if (page === 0 && !cat) {
        const picks = await getAiPicks();
        return NextResponse.json({ ok: true, picks, items, nextPage });
      }
      return NextResponse.json({ ok: true, items, nextPage });
    }

    // Default: full initial payload (used by RSC on first paint)
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
        items: [],
        nextPage: null,
      },
      { status: 200 }, // soft fail to keep UI responsive
    );
  }
}
