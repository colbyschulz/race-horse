import "server-only";

import type { Anthropic } from "@anthropic-ai/sdk";
import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { plans, workouts } from "@/server/db/schema";
import type { SecondaryWorkout } from "@/server/db/schema";
import {
  listPlansWithCounts,
  getPlanById,
  createPlan,
  setActivePlan,
  archivePlan,
} from "@/server/plans/queries";
import { addDays } from "@/lib/dates";
import type { ToolHandler } from "../types";

type Tool = Anthropic.Messages.Tool;

// Default read window when the caller doesn't pass from/to. Weekly totals for
// the whole plan are always included, so the coach still sees the arc.
export const PLAN_READ_LOOKBACK_DAYS = 14;
export const PLAN_READ_LOOKAHEAD_DAYS = 28;

const WORKOUT_TYPES = [
  "easy",
  "long",
  "tempo",
  "threshold",
  "intervals",
  "recovery",
  "race",
  "rest",
  "cross",
] as const;

const WINDOW_DESCRIPTION =
  `Optional YYYY-MM-DD bounds for the workouts returned. Omit both to get the default window (${PLAN_READ_LOOKBACK_DAYS} days back through ${PLAN_READ_LOOKAHEAD_DAYS} days ahead of today). ` +
  `Weekly totals for the WHOLE plan are always returned regardless of the window, so widen the window only for the weeks you intend to read or edit.`;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const getActivePlanTool: Tool = {
  name: "get_active_plan",
  description:
    "Returns the user's currently active training plan, its workouts inside a date window (each with its day-of-week), and weekly totals for the whole plan.",
  input_schema: {
    type: "object" as const,
    properties: {
      from: { type: "string", description: WINDOW_DESCRIPTION },
      to: { type: "string", description: "See `from`." },
    },
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
  description:
    "Returns a specific training plan by ID, its workouts inside a date window (each with its day-of-week), and weekly totals for the whole plan. Pass from/to to read exactly the weeks you need — reading the whole plan is expensive and rarely necessary.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_id: {
        type: "string",
        description: "The UUID of the plan to retrieve.",
      },
      from: { type: "string", description: WINDOW_DESCRIPTION },
      to: { type: "string", description: "See `from`." },
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

const SECONDARY_SCHEMA = {
  type: "object",
  description:
    "Second session on the same day (doubles — e.g. PM shakeout after AM intervals). Rendered as its own row; the day's displayed total is primary + secondary, computed automatically.",
  properties: {
    type: { type: "string", enum: [...WORKOUT_TYPES] },
    distance_km: {
      type: "number",
      description: "Distance for this second session only — not the combined day total.",
    },
    duration_minutes: { type: "number" },
    notes: { type: "string" },
  },
  required: ["type"],
} as const;

export const updateWorkoutsTool: Tool = {
  name: "update_workouts",
  description:
    "Upserts or deletes workouts within a plan by date. Operations: `upsert` replaces the day's primary session (omit `secondary` to KEEP an existing second session, pass `secondary: null` to remove it, or pass an object to set it); `set_secondary` changes only the second session on a day that already has a primary; `delete` removes the whole day. During cold-start plan builds, call once per week and set week_number + total_weeks so the user sees per-week progress. The result echoes each written date with its day-of-week — check it.",
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
        description: "Ordered list of operations.",
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
                      enum: [...WORKOUT_TYPES],
                      description:
                        "Workout type. Use 'cross' for cross-training (cycling, swimming, etc.) within a run or bike plan — never remove a cross-training day just because it differs from the plan sport.",
                    },
                    distance_km: {
                      type: "number",
                      description:
                        "Distance for THIS session only. On a doubles day, this is the primary session alone — never the combined day total (that gets summed automatically for display).",
                    },
                    duration_minutes: { type: "number" },
                    notes: { type: "string" },
                  },
                  required: ["type"],
                },
                secondary: {
                  oneOf: [SECONDARY_SCHEMA, { type: "null" }],
                  description:
                    "Omit to keep the day's existing second session. Pass null to remove it. Pass an object to set/replace it.",
                },
              },
              required: ["op", "date", "workout"],
            },
            {
              type: "object",
              properties: {
                op: { type: "string", enum: ["set_secondary"] },
                date: {
                  type: "string",
                  description: "YYYY-MM-DD — must already have a primary workout.",
                },
                secondary: {
                  oneOf: [SECONDARY_SCHEMA, { type: "null" }],
                  description: "The new second session, or null to remove it.",
                },
              },
              required: ["op", "date", "secondary"],
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
    "Marks a plan as fully generated (moves it from 'GENERATING' to ready). Also corrects plan metadata if the stub values need updating — the stub is created with start_date=today which is almost always wrong for future plans. Pass start_date as the first workout date, end_date as the actual last race/workout date, and title if you want to refine the stub title. Cold-start plans are auto-finalized at the end of the turn once workouts have been written — calling this explicitly to set correct dates is strongly preferred.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_id: { type: "string", description: "The UUID of the plan to mark complete." },
      start_date: {
        type: "string",
        description:
          "Correct start date in YYYY-MM-DD format. Should be the date of the first workout. The stub is always created with start_date=today, which is wrong for plans that start in the future — always pass this.",
      },
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayName(iso: string): string {
  return DAY_NAMES[new Date(`${iso}T12:00:00`).getDay()];
}

function mapWorkout(w: typeof workouts.$inferSelect) {
  const m = w.distance_meters != null ? parseFloat(w.distance_meters) : null;
  return {
    id: w.id,
    date: w.date,
    day: dayName(w.date),
    type: w.type,
    distance_mi: m != null ? Math.round((m / 1609.344) * 10) / 10 : null,
    distance_km: m != null ? Math.round((m / 1000) * 10) / 10 : null,
    duration_minutes: w.duration_seconds != null ? Math.round(w.duration_seconds / 60) : null,
    notes: w.notes,
    secondary: w.secondary,
  };
}

function computeWeeklyTotals(
  rows: Pick<typeof workouts.$inferSelect, "date" | "distance_meters" | "secondary">[]
): { week_start: string; total_mi: number; total_km: number }[] {
  const weekTotals: Record<string, number> = {};
  for (const w of rows) {
    let meters = w.distance_meters != null ? parseFloat(w.distance_meters) : 0;
    if (w.secondary?.distance_km != null) meters += w.secondary.distance_km * 1000;
    const d = new Date(`${w.date}T12:00:00`);
    const daysToMon = (d.getDay() + 6) % 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - daysToMon);
    const key = mon.toISOString().slice(0, 10);
    weekTotals[key] = (weekTotals[key] ?? 0) + meters;
  }
  return Object.entries(weekTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, meters]) => ({
      week_start,
      total_mi: Math.round((meters / 1609.344) * 10) / 10,
      total_km: Math.round((meters / 1000) * 10) / 10,
    }));
}

type ReadWindow = {
  from: string | null;
  to: string | null;
  workouts_in_window: number;
  total_workouts: number;
  note: string;
};

/**
 * Resolves the read window. Explicit from/to win; otherwise a default window
 * around `today`; if there's no `today` in context (tests, legacy callers),
 * the whole plan is returned.
 */
function resolveWindow(
  input: { from?: string; to?: string },
  today: string | undefined
): { from: string | null; to: string | null } {
  const from = input.from && ISO_DATE.test(input.from) ? input.from : null;
  const to = input.to && ISO_DATE.test(input.to) ? input.to : null;
  if (from || to) return { from, to };
  if (!today) return { from: null, to: null };
  return {
    from: addDays(today, -PLAN_READ_LOOKBACK_DAYS),
    to: addDays(today, PLAN_READ_LOOKAHEAD_DAYS),
  };
}

async function readPlanWorkouts(
  planId: string,
  window: { from: string | null; to: string | null }
): Promise<{
  workouts: ReturnType<typeof mapWorkout>[];
  weekly_totals: ReturnType<typeof computeWeeklyTotals>;
  window: ReadWindow;
}> {
  const all = await db
    .select()
    .from(workouts)
    .where(eq(workouts.plan_id, planId))
    .orderBy(workouts.date);

  const inWindow = all.filter(
    (w) =>
      (window.from == null || w.date >= window.from) && (window.to == null || w.date <= window.to)
  );

  const note =
    window.from == null && window.to == null
      ? "All workouts returned."
      : `Workouts limited to ${window.from ?? "plan start"} through ${window.to ?? "plan end"}. Weekly totals cover the whole plan. Pass from/to to read other weeks.`;

  return {
    workouts: inWindow.map(mapWorkout),
    weekly_totals: computeWeeklyTotals(all),
    window: {
      from: window.from,
      to: window.to,
      workouts_in_window: inWindow.length,
      total_workouts: all.length,
      note,
    },
  };
}

export const get_active_plan_handler: ToolHandler<
  { from?: string; to?: string },
  {
    plan: typeof plans.$inferSelect | null;
    workouts: ReturnType<typeof mapWorkout>[];
    weekly_totals: { week_start: string; total_mi: number; total_km: number }[];
    window?: ReadWindow;
  }
> = async (input, { userId, today }) => {
  const activePlans = await db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.is_active, true)))
    .limit(1);

  const plan = activePlans[0] ?? null;
  if (!plan) {
    return { plan: null, workouts: [], weekly_totals: [] };
  }

  const read = await readPlanWorkouts(plan.id, resolveWindow(input ?? {}, today));
  return { plan, ...read };
};

export const list_plans_handler: ToolHandler<
  Record<string, never>,
  { plans: Awaited<ReturnType<typeof listPlansWithCounts>> }
> = async (_input, { userId }) => {
  const result = await listPlansWithCounts(userId);
  return { plans: result };
};

export const get_plan_handler: ToolHandler<
  { plan_id: string; from?: string; to?: string },
  {
    plan: typeof plans.$inferSelect;
    workouts: ReturnType<typeof mapWorkout>[];
    weekly_totals: { week_start: string; total_mi: number; total_km: number }[];
    window: ReadWindow;
  }
> = async (input, { userId, today }) => {
  const plan = await getPlanById(input.plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }

  const read = await readPlanWorkouts(input.plan_id, resolveWindow(input, today));
  return { plan, ...read };
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

type SecondaryInput = {
  type: string;
  distance_km?: number;
  duration_minutes?: number;
  notes?: string;
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
  /** undefined = keep existing; null = remove; object = set. */
  secondary?: SecondaryInput | null;
};

type SetSecondaryOp = {
  op: "set_secondary";
  date: string;
  secondary: SecondaryInput | null;
};

type DeleteOp = {
  op: "delete";
  date: string;
};

type WorkoutOperation = UpsertOp | SetSecondaryOp | DeleteOp;

function toSecondary(input: SecondaryInput | null | undefined): SecondaryWorkout | null {
  if (!input) return null;
  return {
    type: input.type as SecondaryWorkout["type"],
    distance_km: input.distance_km,
    duration_minutes: input.duration_minutes,
    notes: input.notes,
  };
}

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
    days: { date: string; day: string; type: string; secondary?: string | null }[];
    warnings?: string[];
  }
> = async ({ plan_id, operations, week_number, total_weeks }, { userId }) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }

  let upserted = 0;
  let deleted = 0;
  const days: { date: string; day: string; type: string; secondary?: string | null }[] = [];
  const warnings: string[] = [];

  for (const op of operations) {
    if (!ISO_DATE.test(op.date)) {
      warnings.push(`Skipped ${op.op} — invalid date "${op.date}" (expected YYYY-MM-DD).`);
      continue;
    }

    if (op.op === "delete") {
      await db
        .delete(workouts)
        .where(and(eq(workouts.plan_id, plan_id), eq(workouts.date, op.date)));
      deleted++;
      continue;
    }

    // Both upsert and set_secondary need the current row (if any).
    const existingRows = await db
      .select()
      .from(workouts)
      .where(and(eq(workouts.plan_id, plan_id), eq(workouts.date, op.date)))
      .limit(1);
    const existing = existingRows[0] ?? null;

    if (op.op === "set_secondary") {
      if (!existing) {
        warnings.push(
          `Skipped set_secondary on ${op.date} — no primary workout exists that day. Use upsert instead.`
        );
        continue;
      }
      const secondary = toSecondary(op.secondary);
      await db
        .update(workouts)
        .set({ secondary })
        .where(and(eq(workouts.plan_id, plan_id), eq(workouts.date, op.date)));
      upserted++;
      days.push({
        date: op.date,
        day: dayName(op.date),
        type: existing.type,
        secondary: secondary?.type ?? null,
      });
      continue;
    }

    if (op.op === "upsert") {
      // undefined → keep what's there; null → remove; object → replace.
      const secondary: SecondaryWorkout | null =
        op.secondary === undefined
          ? ((existing?.secondary as SecondaryWorkout | null | undefined) ?? null)
          : toSecondary(op.secondary);

      // No unique constraint on (plan_id, date) — use delete + insert.
      await db
        .delete(workouts)
        .where(and(eq(workouts.plan_id, plan_id), eq(workouts.date, op.date)));

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
      days.push({
        date: op.date,
        day: dayName(op.date),
        type: op.workout.type,
        secondary: secondary?.type ?? null,
      });
    }
  }

  return {
    upserted,
    deleted,
    week_number,
    total_weeks,
    days,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
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
  { plan_id: string; start_date?: string; end_date?: string; title?: string },
  { ok: true }
> = async ({ plan_id, start_date, end_date, title }, { userId }) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }
  await db
    .update(plans)
    .set({
      generation_status: "complete",
      updated_at: new Date(),
      ...(start_date ? { start_date } : {}),
      ...(end_date ? { end_date } : {}),
      ...(title ? { title } : {}),
    })
    .where(and(eq(plans.id, plan_id), eq(plans.userId, userId)));
  return { ok: true };
};

// Kept for callers that want a date-range query without the mapping layer.
export async function listPlanWorkoutsBetween(planId: string, from: string, to: string) {
  return db
    .select()
    .from(workouts)
    .where(and(eq(workouts.plan_id, planId), gte(workouts.date, from), lte(workouts.date, to)))
    .orderBy(workouts.date);
}
