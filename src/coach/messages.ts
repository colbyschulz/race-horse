import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import type { ContentBlock, Role, StoredMessage } from "./types";

export async function loadHistory(userId: string): Promise<StoredMessage[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.user_id, userId))
    .orderBy(asc(messages.created_at)) as Promise<StoredMessage[]>;
}

export async function appendMessage(
  userId: string,
  role: Role,
  content: ContentBlock[],
): Promise<StoredMessage> {
  const result = await db
    .insert(messages)
    .values({ user_id: userId, role, content })
    .returning();
  if (!result[0]) throw new Error("appendMessage: no row returned");
  return result[0] as StoredMessage;
}

export async function clearMessages(userId: string): Promise<void> {
  await db.delete(messages).where(eq(messages.user_id, userId));
}
