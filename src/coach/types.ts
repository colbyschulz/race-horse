import type { Anthropic } from "@anthropic-ai/sdk";

export type Role = "user" | "assistant";

// Re-shaped subset of Anthropic message content blocks we care about.
export type ContentBlock = Anthropic.ContentBlockParam;

export type StoredMessage = {
  id: string;
  role: Role;
  content: ContentBlock[];
  created_at: Date;
};

export type ToolName =
  | "get_active_plan"
  | "list_plans"
  | "get_plan"
  | "create_plan"
  | "update_workouts"
  | "set_active_plan"
  | "archive_plan"
  | "get_recent_activities"
  | "get_activity_laps"
  | "update_activity_match"
  | "get_athlete_summary"
  | "update_coach_notes";

export type ToolHandler<I = unknown, O = unknown> = (
  input: I,
  ctx: { userId: string },
) => Promise<O>;

export type SSEEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-use"; name: ToolName; input: unknown }
  | { type: "tool-result"; name: ToolName; result_summary: string }
  | { type: "done"; message_id: string }
  | { type: "error"; error: string };

export type ChatRequestBody = {
  message: string;
  from_route?: string; // e.g. "/today", "/calendar", "/plans"
};
