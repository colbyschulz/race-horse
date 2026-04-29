import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { mondayOf } from "@/lib/dates";
import type { CreatePlanInput, Plan, PlanWithCounts } from "./types";

export async function listPlans(userId: string): Promise<Plan[]> {
  return db
    .select()
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.is_active), desc(plans.start_date)) as Promise<Plan[]>;
}

export async function getPlanById(planId: string, userId: string): Promise<Plan | null> {
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .limit(1);
  return (rows[0] as Plan | undefined) ?? null;
}

export async function createPlan(userId: string, input: CreatePlanInput): Promise<Plan> {
  const result = await db
    .insert(plans)
    .values({
      userId,
      title: input.title,
      sport: input.sport,
      mode: input.mode,
      goal: input.goal ?? null,
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      source: input.source,
      source_file_id: input.source_file_id ?? null,
      is_active: false,
      ...(input.generation_status ? { generation_status: input.generation_status } : {}),
      updated_at: new Date(),
    })
    .returning();
  if (!result[0]) throw new Error("createPlan: no row returned");
  return result[0] as Plan;
}

/**
 * Activates `planId` for `userId` and deactivates all of the user's other plans.
 *
 * Single UPDATE so the partial unique index `(userId) WHERE is_active` is never
 * violated mid-statement (Postgres evaluates SET per row atomically).
 *
 * **Precondition:** caller MUST verify `planId` belongs to `userId` first
 * (e.g. via `getPlanById`). If `planId` is foreign, this becomes a no-op activation
 * AND deactivates every plan the user owns — the API route does this guard for us.
 */
export async function setActivePlan(planId: string, userId: string): Promise<void> {
  await db
    .update(plans)
    .set({
      is_active: sql`(${plans.id} = ${planId})`,
      updated_at: new Date(),
    })
    .where(eq(plans.userId, userId));
}

export async function archivePlan(planId: string, userId: string): Promise<void> {
  await db
    .update(plans)
    .set({ is_active: false, updated_at: new Date() })
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
}

export async function deletePlan(planId: string, userId: string): Promise<void> {
  await db.delete(plans).where(and(eq(plans.id, planId), eq(plans.userId, userId)));
}

export async function listPlansWithCounts(userId: string): Promise<PlanWithCounts[]> {
  const planRows = (await db
    .select()
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.is_active), desc(plans.start_date))) as Plan[];

  if (planRows.length === 0) return [];

  const planIds = planRows.map((p) => p.id);
  const workoutRows = await db
    .select({
      plan_id: workouts.plan_id,
      date: workouts.date,
      distance_meters: workouts.distance_meters,
    })
    .from(workouts)
    .where(inArray(workouts.plan_id, planIds));

  const byPlan = new Map<string, { date: string; distance_meters: string | null }[]>();
  for (const w of workoutRows) {
    const arr = byPlan.get(w.plan_id) ?? [];
    arr.push({ date: w.date, distance_meters: w.distance_meters });
    byPlan.set(w.plan_id, arr);
  }

  return planRows.map((plan) => {
    const ws = byPlan.get(plan.id) ?? [];
    const weekBuckets = new Map<string, number>();
    let longest_run_meters = 0;
    for (const w of ws) {
      if (!w.distance_meters) continue;
      const m = Number(w.distance_meters);
      const monday = mondayOf(w.date);
      weekBuckets.set(monday, (weekBuckets.get(monday) ?? 0) + m);
      if (m > longest_run_meters) longest_run_meters = m;
    }
    const max_weekly_meters = weekBuckets.size > 0 ? Math.max(...weekBuckets.values()) : 0;
    return { ...plan, max_weekly_meters, longest_run_meters };
  });
}
