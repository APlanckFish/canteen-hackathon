/**
 * Server-side proxy that fetches a user's polymarket.com profile page and
 * extracts their `proxyWallet` (= deposit wallet for V2 users).
 *
 * Why server-side:
 *   - Polymarket geo-blocks browsers from restricted regions.
 *   - The profile HTML embeds proxyWallet directly (no client-side fetch
 *     needed), so all we have to do is scrape one regex match.
 *
 * Run from Vercel Edge HKG region for the same reason as our CLOB proxy.
 */

export const runtime = "edge";
export const preferredRegion = ["hkg1"];

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!address || !ADDR_RE.test(address)) {
    return Response.json(
      { error: "missing or invalid `address` query param" },
      { status: 400 },
    );
  }

  const url = `https://polymarket.com/profile/${address}`;
  let html: string;
  try {
    const r = await fetch(url, {
      headers: {
        // Some CDN edges 403 unknown UAs; mimic a real browser.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept": "text/html,application/xhtml+xml",
      },
    });
    if (!r.ok) {
      return Response.json(
        { error: `polymarket profile fetch failed: ${r.status}` },
        { status: 502 },
      );
    }
    html = await r.text();
  } catch (e) {
    return Response.json(
      { error: `fetch failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  // Pull proxyWallet from the embedded RSC payload.
  // Pattern: "proxyWallet":"0x..."
  const m = html.match(/"proxyWallet"\s*:\s*"(0x[0-9a-fA-F]{40})"/);
  if (!m) {
    return Response.json(
      {
        error:
          "proxyWallet not found in profile page — user may not be registered on polymarket.com",
      },
      { status: 404 },
    );
  }

  return Response.json({
    eoa: address.toLowerCase(),
    fundingWallet: m[1].toLowerCase(),
  });
}
