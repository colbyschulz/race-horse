// src/app/api/plans/upload/[id]/save/route.ts
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { workouts } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { getPlanFileById, setExtractedPlanId } from "@/server/plans/files";
import { createPlan, deletePlan, setActivePlan } from "@/server/plans/queries";
import { materializeWorkouts, computeEndDate, type ExtractedWorkout } from "@/server/plans/materialize";
import { ExtractedPlanSchema } from "@/server/extraction/schema";
import type { Sport, PlanMode, Goal } from "@/server/plans/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
type Ctx = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
function notFound() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}
function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

type SaveBody = {
  title: string;
  sport: Sport;
  mode: PlanMode;
  goal?: Goal | null;
  start_date: string;
  set_active: boolean;
};

function validate(body: unknown): SaveBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return null;
  if (b.sport !== "run" && b.sport !== "bike") return null;
  if (b.mode !== "goal" && b.mode !== "indefinite") return null;
  if (typeof b.start_date !== "string" || !ISO_DATE.test(b.start_date)) return null;
  if (typeof b.set_active !== "boolean") return null;
  return {
    title: b.title.trim(),
    sport: b.sport,
    mode: b.mode,
    goal: (b.goal as Goal | null | undefined) ?? null,
    start_date: b.start_date,
    set_active: b.set_active,
  };
}

export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;
  const { id } = await ctx.params;

  const file = await getPlanFileById(id, userId);
  if (!file) return notFound();
  if (file.status !== "extracted") return badRequest("not ready");
  if (file.extracted_plan_id) return badRequest("already saved");

  const parsed = ExtractedPlanSchema.safeParse(file.extracted_payload);
  if (!parsed.success) return badRequest("payload corrupt");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON");
  }
  const input = validate(body);
  if (!input) return badRequest("invalid body");

  const materialized = materializeWorkouts(
    input.start_date,
    parsed.data.workouts as ExtractedWorkout[]
  );
  const endDate =
    input.mode === "indefinite" || materialized.length === 0 ? null : computeEndDate(materialized);

  // 1. Insert plan (always inactive at first; we activate in step 4 if requested).
  const plan = await createPlan(userId, {
    title: input.title,
    sport: input.sport,
    mode: input.mode,
    goal: input.goal ?? undefined,
    start_date: input.start_date,
    end_date: endDate,
    source: "uploaded",
    source_file_id: file.id,
  });

  // 2. Insert workouts.
  if (materialized.length > 0) {
    try {
      await db.insert(workouts).values(
        materialized.map((w) => ({
          plan_id: plan.id,
          date: w.date,
          sport: w.sport,
          type: w.type,
          distance_meters: w.distance_meters == null ? null : String(w.distance_meters),
          duration_seconds: w.duration_seconds,
          target_intensity: w.target_intensity,
          intervals: w.intervals,
          notes: w.notes,
        }))
      );
    } catch (err) {
      // Best-effort rollback: delete the plan we just inserted.
      try {
        await deletePlan(plan.id, userId);
      } catch {
        /* swallow */
      }
      throw err;
    }
  }

  // 3. Link file → plan.
  await setExtractedPlanId(file.id, userId, plan.id);

  // 4. Activate if requested.
  if (input.set_active) {
    await setActivePlan(plan.id, userId);
  }

  return NextResponse.json({ plan_id: plan.id }, { status: 201 });
}
