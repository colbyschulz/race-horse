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
