import "server-only";
import { after } from "next/server";
import type { SSEEvent } from "@/types/coach";
import { upsertTurnStatus } from "@/server/coach/turn-status";
import { SSE_HEADERS, sseEvent } from "./sse";

export type TurnTracking = { userId: string; planId: string | null };

export function sseResponse(gen: AsyncIterable<SSEEvent>, turnTracking?: TurnTracking): Response {
  const enc = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let clientGone = false;

  const drained = (async () => {
    let settled = false;
    try {
      if (turnTracking) {
        await upsertTurnStatus(turnTracking.userId, turnTracking.planId, "running", null);
      }
      for await (const event of gen) {
        if (!clientGone) {
          try {
            controller!.enqueue(enc.encode(sseEvent(event)));
          } catch {
            clientGone = true;
          }
        }
        if (turnTracking && event.type === "done") {
          settled = true;
          await upsertTurnStatus(turnTracking.userId, turnTracking.planId, "done", null);
        } else if (turnTracking && event.type === "error") {
          settled = true;
          await upsertTurnStatus(turnTracking.userId, turnTracking.planId, "error", event.error);
        }
      }
      if (turnTracking && !settled) {
        await upsertTurnStatus(
          turnTracking.userId,
          turnTracking.planId,
          "error",
          "Stream ended without completing"
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      if (!clientGone) {
        try {
          controller!.enqueue(enc.encode(sseEvent({ type: "error", error: msg })));
        } catch {
          clientGone = true;
        }
      }
      if (turnTracking) {
        await upsertTurnStatus(turnTracking.userId, turnTracking.planId, "error", msg);
      }
    } finally {
      if (!clientGone) {
        try {
          controller!.close();
        } catch {
          /* already closed */
        }
      }
    }
  })();

  // Keeps this invocation alive (up to the route's maxDuration) until `drained`
  // settles, even if the client disconnects before then.
  after(drained);

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      clientGone = true;
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
