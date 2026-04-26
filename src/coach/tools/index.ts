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
  get_active_plan_handler,
  list_plans_handler,
  get_plan_handler,
  create_plan_handler,
  update_workouts_handler,
  set_active_plan_handler,
  archive_plan_handler,
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
import { update_coach_notes, update_coach_notes_handler } from "./notes";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const TOOLS: Anthropic.Messages.Tool[] = [
  getActivePlanTool,
  listPlansTool,
  getPlanTool,
  createPlanTool,
  updateWorkoutsTool,
  setActivePlanTool,
  archivePlanTool,
  get_recent_activities,
  get_activity_laps,
  update_activity_match,
  get_athlete_summary,
  update_coach_notes,
  { type: "web_search_20260209", name: "web_search" } as unknown as Anthropic.Messages.Tool,
];

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
  get_recent_activities: get_recent_activities_handler as AnyHandler,
  get_activity_laps: get_activity_laps_handler as AnyHandler,
  update_activity_match: update_activity_match_handler as AnyHandler,
  get_athlete_summary: get_athlete_summary_handler as AnyHandler,
  update_coach_notes: update_coach_notes_handler as AnyHandler,
};

// ---------------------------------------------------------------------------
// Summarizer
// ---------------------------------------------------------------------------

export function summarizeToolResult(name: ToolName, result: unknown): string {
  const r = result as Record<string, number>;
  switch (name) {
    case "get_active_plan":
      return "Read active plan";
    case "list_plans":
      return "Listed plans";
    case "get_plan":
      return "Read plan";
    case "create_plan":
      return "Created plan";
    case "update_workouts":
      return `Updated workouts (${r.upserted ?? 0} upserted, ${r.deleted ?? 0} deleted)`;
    case "set_active_plan":
      return "Activated plan";
    case "archive_plan":
      return "Archived plan";
    case "get_recent_activities":
      return "Read recent activities";
    case "get_activity_laps":
      return "Read activity laps";
    case "update_activity_match":
      return "Updated activity match";
    case "get_athlete_summary":
      return "Read athlete summary";
    case "update_coach_notes":
      return "Updated coach notes";
  }
}
