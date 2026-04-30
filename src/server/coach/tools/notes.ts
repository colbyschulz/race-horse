import "server-only";

import type { Anthropic } from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, plans } from "@/server/db/schema";
import type { ToolHandler } from "../types";

type Tool = Anthropic.Messages.Tool;

export const update_coach_notes: Tool = {
  name: "update_coach_notes",
  description:
    "Overwrites the user's general coach notes (cross-plan memory — preferences, injuries, long-term goals). Notes ≤ 4096 characters.",
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
  await db.update(users).set({ coach_notes: input.content }).where(eq(users.id, userId));
  return { ok: true, bytes: input.content.length };
};

export const update_plan_notes: Tool = {
  name: "update_plan_notes",
  description:
    "Overwrites coach notes for the current plan (plan-specific memory — this plan's goals, injuries, constraints, recent adjustments). Notes ≤ 4096 characters.",
  input_schema: {
    type: "object",
    properties: { content: { type: "string", maxLength: 4096 } },
    required: ["content"],
    additionalProperties: false,
  },
};

export const update_plan_notes_handler: ToolHandler<
  { content: string },
  { ok: true; bytes: number } | { ok: false; error: string }
> = async (input, { userId, planId }) => {
  if (typeof input.content !== "string") throw new Error("content must be string");
  if (input.content.length > 4096) throw new Error("content exceeds 4096 chars");
  if (!planId)
    return { ok: false, error: "No plan context — use update_coach_notes for general notes." };
  await db
    .update(plans)
    .set({ coach_notes: input.content })
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
  return { ok: true, bytes: input.content.length };
};
