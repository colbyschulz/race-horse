import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { runCoach } from "@/server/coach/runner";
import { todayIso } from "@/lib/dates";
import { sseResponse } from "@/lib/sse-server";
import type { ChatRequestBody } from "@/server/coach/types";
import { requireUser } from "@/lib/api-auth";

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

  const [userRow] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, user.userId))
    .limit(1);
  const tz = (userRow?.preferences as { timezone?: string } | null)?.timezone;
  const today = todayIso(tz);
  const planId: string | null = body.plan_id ?? null;

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
