import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { coachTurns } from "@/server/db/schema";

export type CoachTurnStatus = "running" | "done" | "error";

export type CoachTurn = {
  status: CoachTurnStatus;
  error_message: string | null;
  started_at: Date;
};

function planFilter(userId: string, planId: string | null) {
  return planId
    ? and(eq(coachTurns.user_id, userId), eq(coachTurns.plan_id, planId))
    : and(eq(coachTurns.user_id, userId), isNull(coachTurns.plan_id));
}

export async function upsertTurnStatus(
  userId: string,
  planId: string | null,
  status: CoachTurnStatus,
  errorMessage: string | null = null
): Promise<void> {
  const now = new Date();
  const set =
    status === "running"
      ? { status, error_message: errorMessage, started_at: now, updated_at: now }
      : { status, error_message: errorMessage, updated_at: now };

  if (planId) {
    await db
      .insert(coachTurns)
      .values({
        user_id: userId,
        plan_id: planId,
        status,
        error_message: errorMessage,
        started_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [coachTurns.user_id, coachTurns.plan_id],
        targetWhere: sql`${coachTurns.plan_id} is not null`,
        set,
      });
  } else {
    await db
      .insert(coachTurns)
      .values({
        user_id: userId,
        plan_id: null,
        status,
        error_message: errorMessage,
        started_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [coachTurns.user_id],
        targetWhere: sql`${coachTurns.plan_id} is null`,
        set,
      });
  }
}

/**
 * Marks a stuck "running" row as failed. A platform kill never gets to write a
 * final status, so without this the row would report a failure on every return
 * to the chat. Matching on started_at leaves a newer turn untouched.
 */
export async function closeStaleTurn(
  userId: string,
  planId: string | null,
  startedAt: Date,
  message: string
): Promise<void> {
  await db
    .update(coachTurns)
    .set({ status: "error", error_message: message, updated_at: new Date() })
    .where(
      and(
        planFilter(userId, planId),
        eq(coachTurns.status, "running"),
        eq(coachTurns.started_at, startedAt)
      )
    );
}

export async function getTurnStatus(userId: string, planId: string | null): Promise<CoachTurn | null> {
  const rows = await db
    .select({
      status: coachTurns.status,
      error_message: coachTurns.error_message,
      started_at: coachTurns.started_at,
    })
    .from(coachTurns)
    .where(planFilter(userId, planId))
    .limit(1);
  return rows[0] ?? null;
}
