import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { and, asc, eq, gt, gte, lte } from "drizzle-orm";

export type WorkoutRow = typeof workouts.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;

export async function getActivePlan(userId: string): Promise<PlanRow | null> {
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.is_active, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getWorkoutsForDateRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<WorkoutRow[]> {
  const active = await getActivePlan(userId);
  if (!active) return [];
  return db
    .select()
    .from(workouts)
    .where(
      and(
        eq(workouts.plan_id, active.id),
        gte(workouts.date, startDate),
        lte(workouts.date, endDate),
      ),
    )
    .orderBy(asc(workouts.date));
}

export async function getNextWorkouts(
  userId: string,
  today: string,
  n: number,
): Promise<WorkoutRow[]> {
  const active = await getActivePlan(userId);
  if (!active) return [];
  return db
    .select()
    .from(workouts)
    .where(and(eq(workouts.plan_id, active.id), gt(workouts.date, today)))
    .orderBy(asc(workouts.date))
    .limit(n);
}

export async function getWorkoutsForPlan(planId: string): Promise<WorkoutRow[]> {
  return db
    .select()
    .from(workouts)
    .where(eq(workouts.plan_id, planId))
    .orderBy(asc(workouts.date));
}

