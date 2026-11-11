import { cache } from "react";
import { db } from "@/server/db";
import { plans, workouts } from "@/server/db/schema";
import { and, asc, eq, getTableColumns, gt, gte, lte } from "drizzle-orm";

export type WorkoutRow = typeof workouts.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;

const _getActivePlan = async (userId: string): Promise<PlanRow | null> => {
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.is_active, true)))
    .limit(1);
  return rows[0] ?? null;
};

export const getActivePlan = cache(_getActivePlan);

// Workouts of the user's active plan, in one round trip: the join finds the
// active plan, so there is no separate lookup before the workouts query.
function activePlanWorkouts() {
  return db
    .select(getTableColumns(workouts))
    .from(workouts)
    .innerJoin(plans, eq(plans.id, workouts.plan_id));
}

export async function getWorkoutsForDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<WorkoutRow[]> {
  return activePlanWorkouts()
    .where(
      and(
        eq(plans.userId, userId),
        eq(plans.is_active, true),
        gte(workouts.date, startDate),
        lte(workouts.date, endDate)
      )
    )
    .orderBy(asc(workouts.date));
}

export async function getNextWorkouts(
  userId: string,
  today: string,
  n: number
): Promise<WorkoutRow[]> {
  return activePlanWorkouts()
    .where(and(eq(plans.userId, userId), eq(plans.is_active, true), gt(workouts.date, today)))
    .orderBy(asc(workouts.date))
    .limit(n);
}

export async function getWorkoutsForPlan(planId: string): Promise<WorkoutRow[]> {
  return db.select().from(workouts).where(eq(workouts.plan_id, planId)).orderBy(asc(workouts.date));
}
