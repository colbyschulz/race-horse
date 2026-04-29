import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { runCoach } from "@/coach/runner";
import { todayIso } from "@/lib/dates";
import type { ChatRequestBody, SSEEvent } from "@/coach/types";

function sse(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!body.message?.trim()) {
    return new Response(JSON.stringify({ error: "message required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const [userRow] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, session.user.id!)).limit(1);
  const tz = (userRow?.preferences as { timezone?: string } | null)?.timezone;
  const today = todayIso(tz);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const event of runCoach({
          userId: session.user.id!,
          message: body.message,
          planId: body.plan_id ?? null,
          fromRoute: body.from_route,
          planFileId: body.plan_file_id,
          today,
        })) {
          controller.enqueue(enc.encode(sse(event)));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(enc.encode(sse({ type: "error", error: msg })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
