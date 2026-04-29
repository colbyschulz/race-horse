import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import type { ContentBlock, Role, StoredMessage } from "./types";

function planFilter(userId: string, planId: string | null) {
  return planId
    ? and(eq(messages.user_id, userId), eq(messages.plan_id, planId))
    : and(eq(messages.user_id, userId), isNull(messages.plan_id));
}

export async function loadHistory(userId: string, planId: string | null): Promise<StoredMessage[]> {
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
