import { getCuratedMarkets } from "@/lib/ai/topic-curator";
import HomePageClient from "./HomePageClient";

/**
 * RSC entry point for the home page.
 *
 * We pre-fetch the curated market list on the server so the first paint
 * already contains real market cards (no skeleton flash). The client-side
 * <MarketList> then takes over and silently refreshes every 60s.
 *
 * `dynamic = "force-dynamic"` keeps the page out of Next's full-route
 * cache while still letting the underlying KV cache (5 min TTL inside
 * getCuratedMarkets) absorb the load. In effect:
 *   - First user in any 5-min window pays for one Gamma fetch + one
 *     DeepSeek scoring call (~3s total).
 *   - Every other request in that window hits KV → ~50ms.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  // Defensive: any failure in curation should still render the page; the
  // client component will retry every 60s anyway.
  let initialData: Awaited<ReturnType<typeof getCuratedMarkets>> = {
    picks: [],
    all: [],
    cached: false,
  };
  try {
    initialData = await getCuratedMarkets();
  } catch (e) {
    console.warn(
      `[home] getCuratedMarkets failed: ${(e as Error).message}; rendering empty shell`,
    );
  }

  return (
    <HomePageClient
      initialData={{ picks: initialData.picks, all: initialData.all }}
    />
  );
}
