import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { eq, and, lt } from "drizzle-orm";
import { users, plans } from "@/server/db/schema";
import { runCoach } from "@/server/coach/runner";
import { fetchStravaPreload } from "@/server/coach/strava-preload";
import { formatBuildForm, type BuildFormInput } from "@/lib/build-form";
import { todayIso } from "@/lib/dates";
import { sseResponse } from "@/lib/sse";
import { createPlan } from "@/server/plans/queries";
import type { BuildRequestBody, SSEEvent } from "@/server/coach/types";

const STALE_STUB_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

function buildStubTitle(body: BuildRequestBody): string {
  if (body.goal_type === "race") {
    return body.race_event?.trim() || "New plan";
  }
  return body.sport === "bike" ? "Indefinite bike build" : "Indefinite run build";
}

async function* prependPlanCreated(
  planId: string,
  gen: AsyncGenerator<SSEEvent>
): AsyncGenerator<SSEEvent> {
  yield { type: "plan-created", plan_id: planId };
  yield* gen;
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
  if (b.weekly_mileage != null) {
    if (typeof b.weekly_mileage !== "number" || !Number.isFinite(b.weekly_mileage) || b.weekly_mileage < 0) {
      return { ok: false, error: "weekly_mileage must be a non-negative number if provided" };
    }
    if (b.weekly_mileage_unit !== "mi" && b.weekly_mileage_unit !== "km") {
      return { ok: false, error: "weekly_mileage_unit must be 'mi' or 'km' when weekly_mileage is provided" };
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
      weekly_mileage: typeof b.weekly_mileage === "number" ? b.weekly_mileage : undefined,
      weekly_mileage_unit:
        b.weekly_mileage_unit === "mi" || b.weekly_mileage_unit === "km" ? b.weekly_mileage_unit : undefined,
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
    weekly_mileage: body.weekly_mileage,
    weekly_mileage_unit: body.weekly_mileage_unit,
    context: body.context,
  };
  const message = formatBuildForm(formInput);

  const [userRow] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, session.user.id!)).limit(1);
  const tz = (userRow?.preferences as { timezone?: string } | null)?.timezone;
  const today = todayIso(tz);

  // Garbage-collect abandoned stubs from prior build flows the user never
  // finished. Threshold-gated so an in-flight build (just-created stub for a
  // build that's still running in another tab) is preserved. Cascading FK on
  // messages.plan_id deletes their conversations too.
  await db
    .delete(plans)
    .where(
      and(
        eq(plans.userId, session.user.id!),
        eq(plans.generation_status, "generating"),
        lt(plans.created_at, new Date(Date.now() - STALE_STUB_THRESHOLD_MS))
      )
    );

  // Pre-create a stub plan so the entire build conversation binds to a single
  // plan id from message 1. The model populates and finalizes this stub during
  // the run; create_plan is excluded from cold-start tools.
  const stub = await createPlan(session.user.id!, {
    title: buildStubTitle(body),
    sport: body.sport,
    mode: body.goal_type === "race" ? "goal" : "indefinite",
    goal:
      body.goal_type === "race"
        ? {
            race_distance: body.race_event,
            race_date: body.race_date,
            target_time: body.target_time,
          }
        : undefined,
    start_date: today,
    end_date: body.goal_type === "race" ? (body.race_date ?? null) : null,
    source: "coach_generated",
    generation_status: "generating",
  });

  const preload = await fetchStravaPreload(session.user.id!);
  return sseResponse(
    prependPlanCreated(
      stub.id,
      runCoach({
        userId: session.user.id!,
        message,
        today,
        planId: stub.id,
        stravaPreload: preload,
        coldStartBuild: true,
      })
    )
  );
}
