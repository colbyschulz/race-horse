import "server-only";

import type { Anthropic } from "@anthropic-ai/sdk";
import type { ToolHandler, ToolName } from "../types";

// Plans
import {
  getActivePlanTool,
  listPlansTool,
  getPlanTool,
  createPlanTool,
  updateWorkoutsTool,
  setActivePlanTool,
  archivePlanTool,
  finalizePlanTool,
  get_active_plan_handler,
  list_plans_handler,
  get_plan_handler,
  create_plan_handler,
  update_workouts_handler,
  set_active_plan_handler,
  archive_plan_handler,
  finalize_plan_handler,
} from "./plans";

// Activities
import {
  get_recent_activities,
  get_activity_laps,
  update_activity_match,
  get_athlete_summary,
  get_recent_activities_handler,
  get_activity_laps_handler,
  update_activity_match_handler,
  get_athlete_summary_handler,
} from "./activities";

// Notes
import {
  update_coach_notes,
  update_coach_notes_handler,
  update_plan_notes,
  update_plan_notes_handler,
} from "./notes";

// Files
import { readUploadedFileTool, read_uploaded_file_handler } from "./files";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const BASE_TOOLS: Anthropic.Messages.Tool[] = [
  getActivePlanTool,
  listPlansTool,
  getPlanTool,
  createPlanTool,
  updateWorkoutsTool,
  finalizePlanTool,
  setActivePlanTool,
  archivePlanTool,
  get_recent_activities,
  get_activity_laps,
  update_activity_match,
  get_athlete_summary,
  update_coach_notes,
  { type: "web_search_20260209", name: "web_search" } as unknown as Anthropic.Messages.Tool,
  readUploadedFileTool,
];

/** Returns the tool list for a conversation. Plan-context adds update_plan_notes. */
export function getTools(planId: string | null): Anthropic.Messages.Tool[] {
  return planId ? [...BASE_TOOLS, update_plan_notes] : BASE_TOOLS;
}

// During a cold-start build the plan stub is pre-created and provided as
// planId, so the coach only needs to populate it. Strip plan-read,
// plan-management, and plan-creation tools so the model can't accidentally
// read or modify the existing active plan or spin up a parallel stub.
const COLD_START_EXCLUDED = new Set([
  "get_active_plan",
  "list_plans",
  "get_plan",
  "create_plan",
  "set_active_plan",
  "archive_plan",
]);
export function getColdStartTools(planId: string | null): Anthropic.Messages.Tool[] {
  return getTools(planId).filter((t) => !COLD_START_EXCLUDED.has(t.name));
}

// Keep TOOLS / COLD_START_TOOLS as aliases for compatibility (no plan context).
export const TOOLS = BASE_TOOLS;
export const COLD_START_TOOLS = getColdStartTools(null);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = ToolHandler<any, any>;

export const HANDLERS: Record<ToolName, ToolHandler> = {
  get_active_plan: get_active_plan_handler as AnyHandler,
  list_plans: list_plans_handler as AnyHandler,
  get_plan: get_plan_handler as AnyHandler,
  create_plan: create_plan_handler as AnyHandler,
  update_workouts: update_workouts_handler as AnyHandler,
  set_active_plan: set_active_plan_handler as AnyHandler,
  archive_plan: archive_plan_handler as AnyHandler,
  finalize_plan: finalize_plan_handler as AnyHandler,
  get_recent_activities: get_recent_activities_handler as AnyHandler,
  get_activity_laps: get_activity_laps_handler as AnyHandler,
  update_activity_match: update_activity_match_handler as AnyHandler,
  get_athlete_summary: get_athlete_summary_handler as AnyHandler,
  update_coach_notes: update_coach_notes_handler as AnyHandler,
  update_plan_notes: update_plan_notes_handler as AnyHandler,
  read_uploaded_file: read_uploaded_file_handler as AnyHandler,
};

// ---------------------------------------------------------------------------
// Summarizer
// ---------------------------------------------------------------------------

export function summarizeToolResult(name: ToolName, result: unknown): string {
  const r = result as Record<string, number | undefined>;
  switch (name) {
    case "get_active_plan":
      return "Checked your active plan";
    case "list_plans":
      return "Looked at your plans";
    case "get_plan":
      return "Read your plan";
    case "create_plan":
      return "Started a new plan";
    case "update_workouts": {
      const upserted = r.upserted ?? 0;
      const deleted = r.deleted ?? 0;
      const week = r.week_number;
      const total = r.total_weeks;

      const parts: string[] = [];
      if (upserted > 0) parts.push(`added ${upserted} workout${upserted === 1 ? "" : "s"}`);
      if (deleted > 0) parts.push(`removed ${deleted} workout${deleted === 1 ? "" : "s"}`);
      const change = parts.length > 0 ? parts.join(", ") : "no changes";

      if (week != null && total != null) {
        return `Week ${week} of ${total} — ${change}`;
      }
      return change.charAt(0).toUpperCase() + change.slice(1);
    }
    case "set_active_plan":
      return "Made this your active plan";
    case "archive_plan":
      return "Archived plan";
    case "finalize_plan":
      return "Plan ready";
    case "get_recent_activities":
      return "Pulled your recent activities";
    case "get_activity_laps":
      return "Read your splits";
    case "update_activity_match":
      return "Linked workout to activity";
    case "get_athlete_summary":
      return "Reviewed your training history";
    case "update_coach_notes":
      return "Saved a note about you";
    case "update_plan_notes":
      return "Saved a note on this plan";
    case "read_uploaded_file":
      return "Read your uploaded plan";
  }
}
