import type { Anthropic } from "@anthropic-ai/sdk";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import {
  listPlansWithCounts,
  getPlanById,
  createPlan,
  setActivePlan,
  archivePlan,
} from "@/plans/queries";
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
      title: { type: "string", description: "Plan title. Short — e.g. 'Sub-2:30 Chicago Marathon' or 'Spring base'." },
      sport: { type: "string", enum: ["run", "bike"], description: "Sport type." },
      mode: { type: "string", enum: ["goal", "indefinite"], description: "Plan mode." },
      goal: {
        type: "object",
        description: "Structured goal. Required when mode='goal'. Each field is short and label-like, NOT a description.",
        properties: {
          race_distance: {
            type: "string",
            description: "Short event label only: '5K', '10K', 'Half Marathon', 'Marathon', '70.3', '100mi', etc. NEVER a sentence or paragraph.",
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
  description: "Upserts or deletes individual workouts within a plan by date.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_id: { type: "string", description: "The UUID of the plan to modify." },
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
                    type: { type: "string" },
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
    "Marks a plan as fully generated. MUST be the last tool call after `create_plan` + all `update_workouts` for a cold-start plan build. Until called, the plan shows as 'GENERATING' in the UI.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_id: { type: "string", description: "The UUID of the plan to mark complete." },
    },
    required: ["plan_id"],
  },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const get_active_plan_handler: ToolHandler<
  Record<string, never>,
  { plan: (typeof plans.$inferSelect) | null; workouts: (typeof workouts.$inferSelect)[] }
> = async (_input, { userId }) => {
  const activePlans = await db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.is_active, true)))
    .limit(1);

  const plan = activePlans[0] ?? null;
  if (!plan) {
    return { plan: null, workouts: [] };
  }

  const planWorkouts = await db
    .select()
    .from(workouts)
    .where(eq(workouts.plan_id, plan.id));

  return { plan, workouts: planWorkouts };
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
  { plan: typeof plans.$inferSelect; workouts: (typeof workouts.$inferSelect)[] }
> = async ({ plan_id }, { userId }) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }

  const planWorkouts = await db
    .select()
    .from(workouts)
    .where(eq(workouts.plan_id, plan_id));

  return { plan, workouts: planWorkouts };
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
> = async ({ title, sport, mode, goal, start_date, end_date, set_active }, { userId }) => {
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

  if (set_active) {
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
};

type DeleteOp = {
  op: "delete";
  date: string;
};

type WorkoutOperation = UpsertOp | DeleteOp;

export const update_workouts_handler: ToolHandler<
  { plan_id: string; operations: WorkoutOperation[] },
  { upserted: number; deleted: number }
> = async ({ plan_id, operations }, { userId }) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }

  return await db.transaction(async (tx) => {
    let upserted = 0;
    let deleted = 0;

    for (const op of operations) {
      if (op.op === "delete") {
        await tx
          .delete(workouts)
          .where(and(eq(workouts.plan_id, plan_id), eq(workouts.date, op.date)));
        deleted++;
      } else if (op.op === "upsert") {
        // No unique constraint on (plan_id, date) — use delete + insert
        await tx
          .delete(workouts)
          .where(and(eq(workouts.plan_id, plan_id), eq(workouts.date, op.date)));

        await tx.insert(workouts).values({
          plan_id,
          date: op.date,
          sport: plan.sport,
          type: op.workout.type as typeof workouts.$inferInsert["type"],
          distance_meters: op.workout.distance_km != null
            ? String(op.workout.distance_km * 1000)
            : null,
          duration_seconds: op.workout.duration_minutes != null
            ? op.workout.duration_minutes * 60
            : null,
          notes: op.workout.notes ?? "",
        });
        upserted++;
      }
    }

    return { upserted, deleted };
  });
};

export const set_active_plan_handler: ToolHandler<
  { plan_id: string },
  { ok: true }
> = async ({ plan_id }, { userId }) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }
  await setActivePlan(plan_id, userId);
  return { ok: true };
};

export const archive_plan_handler: ToolHandler<
  { plan_id: string },
  { ok: true }
> = async ({ plan_id }, { userId }) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }
  await archivePlan(plan_id, userId);
  return { ok: true };
};

export const finalize_plan_handler: ToolHandler<
  { plan_id: string },
  { ok: true }
> = async ({ plan_id }, { userId }) => {
  const plan = await getPlanById(plan_id, userId);
  if (!plan || plan.userId !== userId) {
    throw new Error("plan not found or not owned");
  }
  await db
    .update(plans)
    .set({ generation_status: "complete", updated_at: new Date() })
    .where(and(eq(plans.id, plan_id), eq(plans.userId, userId)));
  return { ok: true };
};
