import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { messages } from "@/server/db/schema";
import type { ContentBlock, Role, StoredMessage } from "./types";

function planFilter(userId: string, planId: string | null) {
  return planId
    ? and(eq(messages.user_id, userId), eq(messages.plan_id, planId))
    : and(eq(messages.user_id, userId), isNull(messages.plan_id));
}

/** The conversation as the athlete sees it: no turn-scoped system messages. */
export async function loadHistory(userId: string, planId: string | null): Promise<StoredMessage[]> {
  return db
    .select()
    .from(messages)
    .where(and(planFilter(userId, planId), ne(messages.role, "system")))
    .orderBy(asc(messages.created_at)) as Promise<StoredMessage[]>;
}

/** The conversation as the model sees it, system messages included, in stored order. */
export async function loadModelHistory(
  userId: string,
  planId: string | null
): Promise<StoredMessage[]> {
  return db
    .select()
    .from(messages)
    .where(planFilter(userId, planId))
    .orderBy(asc(messages.created_at)) as Promise<StoredMessage[]>;
}

export async function appendMessage(
  userId: string,
  role: Role,
  content: ContentBlock[],
  planId: string | null = null
): Promise<StoredMessage> {
  const result = await db
    .insert(messages)
    .values({ user_id: userId, plan_id: planId ?? undefined, role, content })
    .returning();
  if (!result[0]) throw new Error("appendMessage: no row returned");
  return result[0] as StoredMessage;
}

export async function clearMessages(userId: string, planId: string | null): Promise<void> {
  await db.delete(messages).where(planFilter(userId, planId));
}
