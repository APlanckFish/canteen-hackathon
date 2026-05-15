import {
  build402Response,
  buildChallenge,
  rememberChallenge,
  verifyPayment,
  X402_HEADER,
} from "@/lib/x402/server";
import type { InsightStreamEvent } from "@canteen/shared/insight";
import { fetchMarketById } from "@/lib/polymarket/gamma";
import { runDeepAnalyzer } from "@/lib/ai/deep-analyzer";
import { recordLedger } from "@/lib/tikhub/settler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * x402 three-step:
 *  1. No X-PAYMENT header → return 402 + challenge body, store challenge in KV.
 *  2. Wallet pays on Arc, calls back with X-PAYMENT containing the proof.
 *  3. Server verifies the on-chain Paid log, then opens an SSE stream that
 *     drives the AI analysis pipeline.
 */
export async function POST(
  req: Request,
  { params }: { params: { eventId: string } },
) {
  const { eventId } = params;
  const paymentHeader = req.headers.get(X402_HEADER);

  // ---- Step 1: issue 402 challenge ----
  if (!paymentHeader) {
    let challenge;
    try {
      challenge = buildChallenge({
        eventId,
        resource: req.url,
      });
    } catch (e) {
      return jsonError(500, "X402_INTERNAL", (e as Error).message);
    }
    await rememberChallenge(challenge);
    return build402Response(challenge);
  }

  // ---- Step 2: verify proof ----
  const verify = await verifyPayment(paymentHeader);
  if (!verify.ok) {
    return jsonError(402, verify.code, verify.message);
  }

  // ---- Step 3: open SSE stream ----
  const market = await fetchMarketById(eventId).catch(() => null);

  // Ledger entry for "async settle to TikHub" narrative.
  recordLedger({
    txHash: verify.proof.txHash,
    payer: verify.proof.payer,
    eventId: verify.challenge.eventId,
    amount: verify.challenge.amount,
    chainId: verify.challenge.chainId,
    blockNumber: verify.blockNumber.toString(),
  }).catch((e) => console.warn("[ledger] write failed", e));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (e: InsightStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: keep-alive\n\n`));
      }, 15_000);

      // Resolve locale from the X-Locale header sent by the client. Falls back
      // to "en" so server-side scripts/curl still get a deterministic output.
      const localeHeader = (req.headers.get("x-locale") || "").toLowerCase();
      const locale: "en" | "zh" = localeHeader === "zh" ? "zh" : "en";

      send({
        type: "status",
        stage: "validating_payment",
        message:
          locale === "zh"
            ? `Arc 链上支付已确认（区块 ${verify.blockNumber}）`
            : `Payment verified at block ${verify.blockNumber}`,
      });

      try {
        await runDeepAnalyzer(
          {
            eventId,
            txHash: verify.proof.txHash,
            question: market?.question ?? `Polymarket event ${eventId}`,
            description: market?.description,
            category: market?.category,
            endDate: market?.endDate,
            locale,
          },
          send,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error && e.stack ? e.stack : "";
        console.error("[insight] analyzer failed " + msg + "\n" + stack);
        send({
          type: "error",
          code: "ANALYZER_FAILED",
          message: msg,
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ ok: false, code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
