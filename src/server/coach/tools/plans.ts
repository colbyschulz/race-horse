import "server-only";

import type { Anthropic } from "@anthropic-ai/sdk";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { plans, workouts } from "@/server/db/schema";
import {
  listPlansWithCounts,
  getPlanById,
  createPlan,
  setActivePlan,
  archivePlan,
} from "@/server/plans/queries";
import type { ToolHandler } from "../types";

type Tool = Anthropic.Messages.Tool;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const getActivePlanTool: Tool = {
  name: "get_active_plan",
  description: "Returns the user's currently active training plan and its workouts.",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

export const listPlansTool: Tool = {
  name: "list_plans",
  description: "Lists all of the user's training plans with workout counts.",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

export const getPlanTool: Tool = {
  name: "get_plan",
  description: "Returns a specific training plan and all its workouts by plan ID.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_id: {
        type: "string",
        description: "The UUID of the plan to retrieve.",
      },
    },
    required: ["plan_id"],
  },
};

export const createPlanTool: Tool = {
  name: "create_plan",
  description: "Creates a new training plan for the user.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "Plan title. Short — e.g. 'Sub-2:30 Chicago Marathon' or 'Spring base'.",
      },
      sport: { type: "string", enum: ["run", "bike"], description: "Sport type." },
      mode: { type: "string", enum: ["goal", "indefinite"], description: "Plan mode." },
      goal: {
        type: "object",
        description:
          "Structured goal. Required when mode='goal'. Each field is short and label-like, NOT a description.",
        properties: {
          race_distance: {
            type: "string",
            description:
              "Short event label only: '5K', '10K', 'Half Marathon', 'Marathon', '70.3', '100mi', etc. NEVER a sentence or paragraph.",
          },
          race_date: {
            type: "string",
            description: "Race date in YYYY-MM-DD format.",
          },
          target_time: {
            type: "string",
            description: "Short target time like '2:30:00' or 'sub-20'. NEVER prose.",
          },
        },
      },
      start_date: { type: "string", description: "Start date in YYYY-MM-DD format." },
      end_date: { type: "string", description: "Optional end date in YYYY-MM-DD format." },
      set_active: { type: "boolean", description: "If true, immediately activate this plan." },
    },
    required: ["title", "sport", "mode", "start_date"],
  },
};

export const updateWorkoutsTool: Tool = {
  name: "update_workouts",
  description:
    "Upserts or deletes individual workouts within a plan by date. During cold-start plan builds, call once per week and set week_number + total_weeks so the user sees per-week progress.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_id: { type: "string", description: "The UUID of the plan to modify." },
      week_number: {
        type: "number",
        description:
          "1-indexed week number being written. Required for cold-start plan builds; omit for edits to existing plans.",
      },
      total_weeks: {
        type: "number",
        description:
          "Total number of weeks in the plan. Required for cold-start plan builds; omit for edits.",
      },
      operations: {
        type: "array",
        description: "Ordered list of upsert/delete operations.",
        items: {
          oneOf: [
            {
              type: "object",
              properties: {
                op: { type: "string", enum: ["upsert"] },
                date: { type: "string", description: "YYYY-MM-DD" },
                workout: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["easy", "long", "tempo", "threshold", "intervals", "recovery", "race", "rest", "cross"],
                      description: "Workout type. Use 'cross' for cross-training (cycling, swimming, etc.) within a run or bike plan — never remove a cross-training day just because it differs from the plan sport.",
                    },
                    distance_km: { type: "number" },
                    duration_minutes: { type: "number" },
                    notes: { type: "string" },
                  },
                  required: ["type"],
                },
                secondary: {
                  type: "object",
                  description:
                    "Optional second workout on the same day (doubles — e.g. PM shakeout after a morning intervals session). Rendered as a second row on the day card. Same shape as the primary workout but without intervals.",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["easy", "long", "tempo", "threshold", "intervals", "recovery", "race", "rest", "cross"],
                    },
                    distance_km: { type: "number" },
                    duration_minutes: { type: "number" },
                    notes: { type: "string" },
                  },
                  required: ["type"],
                },
              },
              required: ["op", "date", "workout"],
            },
            {
              type: "object",
              properties: {
                op: { type: "string", enum: ["delete"] },
                date: { type: "string", description: "YYYY-MM-DD" },
              },
              required: ["op", "date"],
            },
          ],
        },
      },
    },
    required: ["plan_id", "operations"],
  },
};

export const setActivePlanTool: Tool = {
  name: "set_active_plan",
  description: "Sets a plan as the user's active training plan.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_id: { type: "string", description: "The UUID of the plan to activate." },
    },
    required: ["plan_id"],
  },
};

export const archivePlanTool: Tool = {
  name: "archive_plan",
  description: "Deactivates (archives) a training plan.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_id: { type: "string", description: "The UUID of the plan to archive." },
    },
    required: ["plan_id"],
  },
};

export const finalizePlanTool: Tool = {
  name: "finalize_plan",
  description:
    "Marks a plan as fully generated (moves it from 'GENERATING' to ready). Also corrects plan metadata if the stub values need updating — pass end_date with the actual last race/workout date, and title if you want to refine the stub title. Cold-start plans are auto-finalized at the end of the turn once workouts have been written — calling this explicitly lets you set the correct end_date and is strongly preferred.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_id: { type: "string", description: "The UUID of the plan to mark complete." },
      end_date: {
        type: "string",
        description:
          "Correct end date in YYYY-MM-DD format. Required when the actual plan end differs from the stub (e.g. a race series where the form's race_date is the first race but the plan runs through the last race).",
      },
      title: {
        type: "string",
        description: "Refined plan title, if the stub title needs updating.",
      },
    },
    required: ["plan_id"],
  },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function mapWorkout(w: typeof workouts.$inferSelect) {
  const m = w.distance_meters != null ? parseFloat(w.distance_meters) : null;
  return {
    id: w.id,
    date: w.date,
    type: w.type,
    distance_mi: m != null ? Math.round((m / 1609.344) * 10) / 10 : null,
    distance_km: m != null ? Math.round((m / 1000) * 10) / 10 : null,
    duration_minutes: w.duration_seconds != null ? Math.round(w.duration_seconds / 60) : null,
    notes: w.notes,
    secondary: w.secondary,
  };
}

export const get_active_plan_handler: ToolHandler<
  Record<string, never>,
  {
    plan: typeof plans.$inferSelect | null;
    workouts: ReturnType<typeof mapWorkout>[];
    weekly_totals: { week_start: string; total_mi: number; total_km: number }[];
  }
> = async (_input, { userId }) => {
  const activePlans = await db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.is_active, true)))
    .limit(1);

  const plan = activePlans[0] ?? null;
  if (!plan) {
    return { plan: null, workouts: [], weekly_totals: [] };
  }

  const planWorkouts = await db.select().from(workouts).where(eq(workouts.plan_id, plan.id)).orderBy(workouts.date);

  const weekTotals: Record<string, number> = {};
  for (const w of planWorkouts) {
    const meters = w.distance_meters != null ? parseFloat(w.distance_meters) : 0;
    const d = new Date(`${w.date}T12:00:00`);
    const daysToMon = (d.getDay() + 6) % 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - daysToMon);
    const key = mon.toISOString().slice(0, 10);
    weekTotals[key] = (weekTotals[key] ?? 0) + meters;
  }
  const weekly_totals = Object.entries(weekTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, meters]) => ({
      week_start,
      total_mi: Math.round((meters / 1609.344) * 10) / 10,
      total_km: Math.round((meters / 1000) * 10) / 10,
    }));

  return { plan, workouts: planWorkouts.map(mapWorkout), weekly_totals };
};

export const list_plans_handler: ToolHandler<
  Record<string, never>,
  { plans: Awaited<ReturnType<typeof listPlansWithCounts>> }
> = async (_input, { userId }) => {
  const result = await listPlansWithCounts(userId);
  return { plans: result };
};

export const get_plan_handler: ToolHandler<
  { plan_id: string },
  {
    plan: typeof plans.$inferSelect;
    workouts: {
      id: string;
      date: string;
      type: string;
      distance_mi: number | null;
      distance_km: number | null;
      duration_minutes: number | null;
      notes: string;
    }[];
    weekly_totals: { week_start: string; total_mi: number; total_km: number }[];
  }
> = async ({ plan_id }, { userId }) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }

  const planWorkouts = await db
    .select({
      id: workouts.id,
      date: workouts.date,
      type: workouts.type,
      distance_meters: workouts.distance_meters,
      duration_seconds: workouts.duration_seconds,
      notes: workouts.notes,
    })
    .from(workouts)
    .where(eq(workouts.plan_id, plan_id))
    .orderBy(workouts.date);

  // Pre-compute distances in both units so the coach never has to do the conversion
  const mapped = planWorkouts.map((w) => {
    const m = w.distance_meters != null ? parseFloat(w.distance_meters) : null;
    return {
      id: w.id,
      date: w.date,
      type: w.type,
      distance_mi: m != null ? Math.round((m / 1609.344) * 10) / 10 : null,
      distance_km: m != null ? Math.round((m / 1000) * 10) / 10 : null,
      duration_minutes: w.duration_seconds != null ? Math.round(w.duration_seconds / 60) : null,
      notes: w.notes,
    };
  });

  // Compute weekly totals (week = Mon–Sun, keyed by the Monday date)
  const weekTotals: Record<string, number> = {};
  for (const w of planWorkouts) {
    const meters = w.distance_meters != null ? parseFloat(w.distance_meters) : 0;
    const d = new Date(`${w.date}T12:00:00`);
    const day = d.getDay(); // 0=Sun…6=Sat
    const daysToMon = (day + 6) % 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - daysToMon);
    const key = mon.toISOString().slice(0, 10);
    weekTotals[key] = (weekTotals[key] ?? 0) + meters;
  }
  const weekly_totals = Object.entries(weekTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, meters]) => ({
      week_start,
      total_mi: Math.round((meters / 1609.344) * 10) / 10,
      total_km: Math.round((meters / 1000) * 10) / 10,
    }));

  return { plan, workouts: mapped, weekly_totals };
};

export const create_plan_handler: ToolHandler<
  {
    title: string;
    sport: "run" | "bike";
    mode: "goal" | "indefinite";
    goal?: { race_distance?: string; race_date?: string; target_time?: string };
    start_date: string;
    end_date?: string;
    set_active?: boolean;
  },
  { plan_id: string }
> = async (
  { title, sport, mode, goal, start_date, end_date, set_active },
  { userId, coldStartBuild }
) => {
  const newPlan = await createPlan(userId, {
    title,
    sport,
    mode,
    goal,
    start_date,
    end_date: end_date ?? null,
    source: "coach_generated",
    generation_status: "generating",
  });

  // In cold-start the existing active plan is read-only — never let a new plan steal it.
  if (set_active && !coldStartBuild) {
    await setActivePlan(newPlan.id, userId);
  }

  return { plan_id: newPlan.id };
};

type UpsertOp = {
  op: "upsert";
  date: string;
  workout: {
    type: string;
    distance_km?: number;
    duration_minutes?: number;
    notes?: string;
  };
  secondary?: {
    type: string;
    distance_km?: number;
    duration_minutes?: number;
    notes?: string;
  } | null;
};

type DeleteOp = {
  op: "delete";
  date: string;
};

type WorkoutOperation = UpsertOp | DeleteOp;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const update_workouts_handler: ToolHandler<
  {
    plan_id: string;
    operations: WorkoutOperation[];
    week_number?: number;
    total_weeks?: number;
  },
  {
    upserted: number;
    deleted: number;
    week_number?: number;
    total_weeks?: number;
    days: { date: string; day: string; type: string }[];
  }
> = async ({ plan_id, operations, week_number, total_weeks }, { userId }) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }

  let upserted = 0;
  let deleted = 0;
  const days: { date: string; day: string; type: string }[] = [];

  for (const op of operations) {
    if (op.op === "delete") {
      await db
        .delete(workouts)
        .where(and(eq(workouts.plan_id, plan_id), eq(workouts.date, op.date)));
      deleted++;
    } else if (op.op === "upsert") {
      // No unique constraint on (plan_id, date) — use delete + insert
      await db
        .delete(workouts)
        .where(and(eq(workouts.plan_id, plan_id), eq(workouts.date, op.date)));

      const secondary = op.secondary
        ? {
            type: op.secondary.type as import("@/server/db/schema").SecondaryWorkout["type"],
            distance_km: op.secondary.distance_km,
            duration_minutes: op.secondary.duration_minutes,
            notes: op.secondary.notes,
          }
        : null;

      await db.insert(workouts).values({
        plan_id,
        date: op.date,
        sport: plan.sport,
        type: op.workout.type as (typeof workouts.$inferInsert)["type"],
        distance_meters:
          op.workout.distance_km != null ? String(op.workout.distance_km * 1000) : null,
        duration_seconds:
          op.workout.duration_minutes != null ? op.workout.duration_minutes * 60 : null,
        notes: op.workout.notes ?? "",
        secondary,
      });
      upserted++;

      // Include day name so the coach can verify date→day mapping after each call
      const dayName = DAY_NAMES[new Date(`${op.date}T12:00:00`).getDay()];
      days.push({ date: op.date, day: dayName, type: op.workout.type });
    }
  }

  return { upserted, deleted, week_number, total_weeks, days };
};

export const set_active_plan_handler: ToolHandler<{ plan_id: string }, { ok: true }> = async (
  { plan_id },
  { userId }
) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }
  await setActivePlan(plan_id, userId);
  return { ok: true };
};

export const archive_plan_handler: ToolHandler<{ plan_id: string }, { ok: true }> = async (
  { plan_id },
  { userId }
) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }
  await archivePlan(plan_id, userId);
  return { ok: true };
};

export const finalize_plan_handler: ToolHandler<
  { plan_id: string; end_date?: string; title?: string },
  { ok: true }
> = async ({ plan_id, end_date, title }, { userId }) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }
  await db
    .update(plans)
    .set({
      generation_status: "complete",
      updated_at: new Date(),
      ...(end_date ? { end_date } : {}),
      ...(title ? { title } : {}),
    })
    .where(and(eq(plans.id, plan_id), eq(plans.userId, userId)));
  return { ok: true };
};
