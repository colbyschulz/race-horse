// src/plans/files.ts
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { planFiles } from "@/server/db/schema";

export type PlanFileRow = {
  id: string;
  userId: string;
  blob_url: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: "extracting" | "extracted" | "failed";
  extraction_error: string | null;
  extracted_payload: unknown | null;
  extracted_plan_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CreatePlanFileInput = {
  id: string;
  userId: string;
  blob_url: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
};

export async function createPlanFile(input: CreatePlanFileInput): Promise<PlanFileRow> {
  const result = await db
    .insert(planFiles)
    .values({
      id: input.id,
      userId: input.userId,
      blob_url: input.blob_url,
      original_filename: input.original_filename,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      status: "extracting",
      updated_at: new Date(),
    })
    .returning();
  if (!result[0]) throw new Error("createPlanFile: no row returned");
  return result[0] as PlanFileRow;
}

export async function getPlanFileById(id: string, userId: string): Promise<PlanFileRow | null> {
  const rows = await db
    .select()
    .from(planFiles)
    .where(and(eq(planFiles.id, id), eq(planFiles.userId, userId)))
    .limit(1);
  return (rows[0] as PlanFileRow | undefined) ?? null;
}

export async function listInFlightPlanFiles(userId: string): Promise<PlanFileRow[]> {
  return db
    .select()
    .from(planFiles)
    .where(and(eq(planFiles.userId, userId), isNull(planFiles.extracted_plan_id)))
    .orderBy(desc(planFiles.created_at)) as Promise<PlanFileRow[]>;
}

export async function updatePlanFileStatus(
  id: string,
  userId: string,
  status: "extracting" | "extracted" | "failed",
  error?: string | null
): Promise<void> {
  await db
    .update(planFiles)
    .set({
      status,
      extraction_error: error == null ? null : error.slice(0, 1024),
      updated_at: new Date(),
    })
    .where(and(eq(planFiles.id, id), eq(planFiles.userId, userId)));
}

export async function setExtractedPayload(
  id: string,
  userId: string,
  payload: unknown
): Promise<void> {
  await db
    .update(planFiles)
    .set({
      status: "extracted",
      extracted_payload: payload as never,
      extraction_error: null,
      updated_at: new Date(),
    })
    .where(and(eq(planFiles.id, id), eq(planFiles.userId, userId)));
}

export async function setExtractedPlanId(
  id: string,
  userId: string,
  planId: string
): Promise<void> {
  await db
    .update(planFiles)
    .set({ extracted_plan_id: planId, updated_at: new Date() })
    .where(and(eq(planFiles.id, id), eq(planFiles.userId, userId)));
}

export async function deletePlanFile(id: string, userId: string): Promise<void> {
  await db.delete(planFiles).where(and(eq(planFiles.id, id), eq(planFiles.userId, userId)));
}

export async function deletePlanFilesByPlanId(
  planId: string,
  userId: string
): Promise<PlanFileRow[]> {
  return db
    .delete(planFiles)
    .where(and(eq(planFiles.extracted_plan_id, planId), eq(planFiles.userId, userId)))
    .returning() as Promise<PlanFileRow[]>;
}
