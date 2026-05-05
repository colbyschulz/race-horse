import type { Anthropic } from "@anthropic-ai/sdk";

export type Role = "user" | "assistant";

// Re-shaped subset of Anthropic message content blocks we care about.
export type ContentBlock = Anthropic.ContentBlockParam;

export type StoredMessage = {
  id: string;
  role: Role;
  plan_id: string | null;
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
  | "finalize_plan"
  | "get_recent_activities"
  | "get_activity_laps"
  | "update_activity_match"
  | "get_athlete_summary"
  | "update_coach_notes"
  | "update_plan_notes"
  | "read_uploaded_file";

export type ToolHandler<I = unknown, O = unknown> = (
  input: I,
  ctx: { userId: string; planId?: string | null; coldStartBuild?: boolean }
) => Promise<O>;

export type SSEEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-use"; name: ToolName; input: unknown }
  | { type: "tool-result"; name: ToolName; result_summary: string }
  | { type: "plan-created"; plan_id: string }
  | { type: "done"; message_id: string }
  | { type: "error"; error: string };

export type ChatRequestBody = {
  message: string;
  from_route?: string; // e.g. "/today", "/training", "/plans"
  plan_file_id?: string;
  plan_id?: string | null;
};

export type BuildRequestBody = {
  sport: "run" | "bike";
  goal_type: "race" | "indefinite";
  race_date?: string; // YYYY-MM-DD, required when goal_type === "race"
  race_event?: string; // required when goal_type === "race"
  target_time?: string; // optional
  weekly_mileage?: number; // optional; paired with weekly_mileage_unit
  weekly_mileage_unit?: "mi" | "km";
  context?: string; // optional free-text "Goals & context"
};
