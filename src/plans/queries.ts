import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import type { CreatePlanInput, Plan, PlanWithCounts } from "./types";

export async function listPlans(userId: string): Promise<Plan[]> {
  return db
    .select()
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.is_active), desc(plans.start_date)) as Promise<Plan[]>;
}

export async function getPlanById(
  planId: string,
  userId: string,
): Promise<Plan | null> {
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .limit(1);
  return (rows[0] as Plan | undefined) ?? null;
}

export async function createPlan(
  userId: string,
  input: CreatePlanInput,
): Promise<Plan> {
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
      updated_at: new Date(),
    })
    .returning();
  if (!result[0]) throw new Error("createPlan: no row returned");
  return result[0] as Plan;
}

export async function setActivePlan(
  planId: string,
  userId: string,
): Promise<void> {
  // Single UPDATE so the partial unique index is never violated mid-statement.
  await db
    .update(plans)
    .set({
      is_active: sql`(${plans.id} = ${planId})`,
      updated_at: new Date(),
    })
    .where(eq(plans.userId, userId));
}

export async function archivePlan(
  planId: string,
  userId: string,
): Promise<void> {
  await db
    .update(plans)
    .set({ is_active: false, updated_at: new Date() })
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
}

export async function deletePlan(
  planId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
}

export async function listPlansWithCounts(_userId: string, _today: string): Promise<PlanWithCounts[]> {
  throw new Error("not implemented");
}
