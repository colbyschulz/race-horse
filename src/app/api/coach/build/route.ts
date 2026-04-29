import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { runCoach } from "@/coach/runner";
import { fetchStravaPreload } from "@/coach/stravaPreload";
import { formatBuildForm, type BuildFormInput } from "@/coach/buildForm";
import { todayIso } from "@/lib/dates";
import type { BuildRequestBody, SSEEvent } from "@/coach/types";

function sse(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function validate(body: unknown): { ok: true; value: BuildRequestBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body required" };
  const b = body as Record<string, unknown>;

  if (b.sport !== "run" && b.sport !== "bike") return { ok: false, error: "sport must be 'run' or 'bike'" };
  if (b.goal_type !== "race" && b.goal_type !== "indefinite") {
    return { ok: false, error: "goal_type must be 'race' or 'indefinite'" };
  }
  if (b.goal_type === "race") {
    if (typeof b.race_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.race_date)) {
      return { ok: false, error: "race_date required for race goal_type (YYYY-MM-DD)" };
    }
    if (typeof b.race_event !== "string" || b.race_event.trim().length === 0) {
      return { ok: false, error: "race_event required for race goal_type" };
    }
  }
  for (const k of ["race_date", "race_event", "target_time", "context"] as const) {
    if (b[k] != null && typeof b[k] !== "string") {
      return { ok: false, error: `${k} must be a string if provided` };
    }
  }

  return {
    ok: true,
    value: {
      sport: b.sport,
      goal_type: b.goal_type,
      race_date: typeof b.race_date === "string" ? b.race_date : undefined,
      race_event: typeof b.race_event === "string" ? b.race_event : undefined,
      target_time: typeof b.target_time === "string" ? b.target_time : undefined,
      context: typeof b.context === "string" ? b.context : undefined,
    },
  };
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const parsed = validate(raw);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const body = parsed.value;

  const formInput: BuildFormInput = {
    sport: body.sport,
    goal_type: body.goal_type,
    race_date: body.race_date,
    race_event: body.race_event,
    target_time: body.target_time,
    context: body.context,
  };
  const message = formatBuildForm(formInput);

  const [userRow] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, session.user.id!)).limit(1);
  const tz = (userRow?.preferences as { timezone?: string } | null)?.timezone;
  const today = todayIso(tz);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        const preload = await fetchStravaPreload(session.user.id!);
        for await (const event of runCoach({
          userId: session.user.id!,
          message,
          today,
          stravaPreload: preload,
          coldStartBuild: true,
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
