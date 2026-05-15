import { NextResponse } from "next/server";
import { getIntegrations } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells the client which upstream integrations are configured. Used to render
 * the "DEMO MODE" badge before the user actually unlocks anything. Note we do
 * NOT expose any secrets — only boolean flags.
 */
export async function GET() {
  const i = getIntegrations();
  return NextResponse.json({
    ok: true,
    deepseek: i.hasDeepseek,
    tikhub: i.hasTikhub,
    kv: i.hasKv,
    vault: i.hasVault,
  });
}
