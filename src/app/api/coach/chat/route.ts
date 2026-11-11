import { NextResponse } from "next/server";
import { runCoach } from "@/server/coach/runner";
import { todayIso } from "@/lib/dates";
import { sseResponse } from "@/lib/sse-server";
import type { ChatRequestBody } from "@/server/coach/types";
import { requireUser } from "@/lib/api-auth";
import { getTurnStatus } from "@/server/coach/turn-status";
import { isTurnStale } from "@/lib/turn-poll";

export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
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

  const today = todayIso(user.preferences?.timezone);
  const planId: string | null = body.plan_id ?? null;

  // One turn at a time per conversation. The app retries a message whose
  // request was dropped (a phone does this when the app is backgrounded), and
  // if the first attempt did arrive, the retry must not start a second reply.
  const turn = await getTurnStatus(user.userId, planId);
  if (turn?.status === "running" && !isTurnStale(turn.status, turn.started_at, Date.now())) {
    return NextResponse.json({ error: "a reply is already in progress" }, { status: 409 });
  }

  return sseResponse(
    runCoach({
      userId: user.userId,
      message: body.message,
      planId,
      fromRoute: body.from_route,
      fromLabel: typeof body.from_label === "string" ? body.from_label.slice(0, 200) : undefined,
      planFileId: body.plan_file_id,
      today,
    }),
    { userId: user.userId, planId }
  );
}
