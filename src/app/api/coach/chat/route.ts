import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { runCoach } from "@/coach/runner";
import { todayIso } from "@/lib/dates";
import { sseResponse } from "@/lib/sse";
import type { ChatRequestBody } from "@/coach/types";

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

  return sseResponse(runCoach({
    userId: session.user.id!,
    message: body.message,
    planId: body.plan_id ?? null,
    fromRoute: body.from_route,
    planFileId: body.plan_file_id,
    today,
  }));
}
