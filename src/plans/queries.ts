import { and, desc, eq } from "drizzle-orm";
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

// Placeholder exports — implemented in later tasks
export async function setActivePlan(_planId: string, _userId: string): Promise<void> {
  throw new Error("not implemented");
}
export async function archivePlan(_planId: string, _userId: string): Promise<void> {
  throw new Error("not implemented");
}
export async function deletePlan(_planId: string, _userId: string): Promise<void> {
  throw new Error("not implemented");
}
export async function listPlansWithCounts(_userId: string, _today: string): Promise<PlanWithCounts[]> {
  throw new Error("not implemented");
}
