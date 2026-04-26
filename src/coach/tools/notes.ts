import type { Anthropic } from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { ToolHandler } from "../types";

type Tool = Anthropic.Messages.Tool;

export const update_coach_notes: Tool = {
  name: "update_coach_notes",
  description:
    "Overwrites the user's coach notes with the provided content. Use to keep durable memory tight and curated. Notes ≤ 4096 characters.",
  input_schema: {
    type: "object",
    properties: { content: { type: "string", maxLength: 4096 } },
    required: ["content"],
    additionalProperties: false,
  },
};

export const update_coach_notes_handler: ToolHandler<
  { content: string },
  { ok: true; bytes: number }
> = async (input, { userId }) => {
  if (typeof input.content !== "string") throw new Error("content must be string");
  if (input.content.length > 4096) throw new Error("content exceeds 4096 chars");
  await db
    .update(users)
    .set({ coach_notes: input.content })
    .where(eq(users.id, userId));
  return { ok: true, bytes: input.content.length };
};
