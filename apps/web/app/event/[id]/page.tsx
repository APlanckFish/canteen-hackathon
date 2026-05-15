import { notFound } from "next/navigation";
import { fetchMarketById } from "@/lib/polymarket/gamma";
import { SiteHeader } from "@/components/common/SiteHeader";
import { SiteFooter } from "@/components/common/SiteFooter";
import { EventDetailClient } from "./EventDetailClient";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const market = await fetchMarketById(params.id).catch(() => null);

  // For demo robustness, never hard-404 — render a synthetic stub if Gamma is
  // unreachable so the rest of the flow is still demo-able. Fallback text is
  // resolved on the client via i18n (see EventDetailClient).
  const safeMarket = market ?? {
    id: params.id,
    slug: params.id,
    question: "",
    description: "",
    yesProb: 0.5,
    volume24h: 0,
    liquidity: 0,
    category: "",
  };

  if (!safeMarket.id) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <EventDetailClient market={safeMarket} isFallback={!market} />
      </main>
      <SiteFooter />
    </div>
  );
}
