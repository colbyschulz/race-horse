import type { Anthropic } from "@anthropic-ai/sdk";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { activities, plans, workouts } from "@/db/schema";
import {
  listRecentActivities,
  getActivityWithLaps,
  getAthleteSummary,
} from "@/strava/queries";
import type { ToolHandler } from "../types";

type Tool = Anthropic.Messages.Tool;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const get_recent_activities: Tool = {
  name: "get_recent_activities",
  description: "Returns recent Strava activities for the user, plus a summary of count, distance, and moving time.",
  input_schema: {
    type: "object" as const,
    properties: {
      days: {
        type: "number",
        description: "Number of days to look back (default 14).",
        default: 14,
      },
    },
    additionalProperties: false,
  },
};

export const get_activity_laps: Tool = {
  name: "get_activity_laps",
  description: "Returns an activity and its lap-by-lap breakdown.",
  input_schema: {
    type: "object" as const,
    properties: {
      activity_id: {
        type: "string",
        description: "UUID of the activity.",
      },
    },
    required: ["activity_id"],
    additionalProperties: false,
  },
};

export const update_activity_match: Tool = {
  name: "update_activity_match",
  description: "Links (or unlinks) a Strava activity to a planned workout.",
  input_schema: {
    type: "object" as const,
    properties: {
      activity_id: {
        type: "string",
        description: "UUID of the activity to update.",
      },
      workout_id: {
        type: ["string", "null"],
        description: "UUID of the workout to link, or null to unset.",
      },
    },
    required: ["activity_id", "workout_id"],
    additionalProperties: false,
  },
};

export const get_athlete_summary: Tool = {
  name: "get_athlete_summary",
  description: "Returns volume rollups (4-week, 12-week, 52-week) for the athlete.",
  input_schema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const get_recent_activities_handler: ToolHandler<
  { days?: number },
  {
    activities: Awaited<ReturnType<typeof listRecentActivities>>;
    summary: { count: number; total_distance_meters: number; total_moving_time_seconds: number };
  }
> = async ({ days = 14 }, { userId }) => {
  const rows = await listRecentActivities(userId, days);
  const summary = {
    count: rows.length,
    total_distance_meters: rows.reduce((acc, r) => acc + (r.distance_meters ?? 0), 0),
    total_moving_time_seconds: rows.reduce((acc, r) => acc + (r.moving_time_seconds ?? 0), 0),
  };
  return { activities: rows, summary };
};

export const get_activity_laps_handler: ToolHandler<
  { activity_id: string },
  Awaited<NonNullable<ReturnType<typeof getActivityWithLaps>>>
> = async ({ activity_id }, { userId }) => {
  const result = await getActivityWithLaps(userId, activity_id);
  if (!result) {
    throw new Error(`activity not found: ${activity_id}`);
  }
  return result;
};

export const update_activity_match_handler: ToolHandler<
  { activity_id: string; workout_id: string | null },
  { ok: true }
> = async ({ activity_id, workout_id }, { userId }) => {
  // Verify activity belongs to user
  const activityRows = await db
    .select({ id: activities.id, userId: activities.userId })
    .from(activities)
    .where(and(eq(activities.id, activity_id), eq(activities.userId, userId)))
    .limit(1);

  if (activityRows.length === 0) {
    throw new Error("activity not found or not owned");
  }

  // If linking to a workout, verify it belongs to the user's plans
  if (workout_id !== null) {
    const workoutRows = await db
      .select({ id: workouts.id })
      .from(workouts)
      .innerJoin(plans, eq(workouts.plan_id, plans.id))
      .where(and(eq(workouts.id, workout_id), eq(plans.userId, userId)))
      .limit(1);

    if (workoutRows.length === 0) {
      throw new Error("workout not found or not owned");
    }
  }

  await db
    .update(activities)
    .set({ matched_workout_id: workout_id })
    .where(eq(activities.id, activity_id));

  return { ok: true };
};

export const get_athlete_summary_handler: ToolHandler<
  Record<string, never>,
  Awaited<ReturnType<typeof getAthleteSummary>>
> = async (_input, { userId }) => {
  return getAthleteSummary(userId);
};
