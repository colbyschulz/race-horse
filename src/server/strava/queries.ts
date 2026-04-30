import { db } from "@/server/db";
import { activities, activityLaps } from "@/server/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

type ActivitySummary = {
  id: string;
  start_date: Date;
  type: string;
  distance_meters: number | null;
  moving_time_seconds: number | null;
  avg_hr: number | null;
  avg_pace_seconds_per_km: number | null;
  avg_power_watts: number | null;
};

type VolumeRollup = {
  count: number;
  total_distance_meters: number;
  total_moving_time_seconds: number;
  by_type: Record<string, { count: number; distance_meters: number; moving_time_seconds: number }>;
};

export async function listRecentActivities(
  userId: string,
  days: number
): Promise<ActivitySummary[]> {
  const rows = await db
    .select({
      id: activities.id,
      start_date: activities.start_date,
      type: activities.type,
      distance_meters: activities.distance_meters,
      moving_time_seconds: activities.moving_time_seconds,
      avg_hr: activities.avg_hr,
      avg_pace_seconds_per_km: activities.avg_pace_seconds_per_km,
      avg_power_watts: activities.avg_power_watts,
    })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        gte(activities.start_date, sql`now() - ${days} * interval '1 day'`)
      )
    )
    .orderBy(desc(activities.start_date));

  return rows.map((r) => ({
    id: r.id,
    start_date: r.start_date,
    type: r.type,
    distance_meters: r.distance_meters != null ? Number(r.distance_meters) : null,
    moving_time_seconds: r.moving_time_seconds,
    avg_hr: r.avg_hr != null ? Number(r.avg_hr) : null,
    avg_pace_seconds_per_km:
      r.avg_pace_seconds_per_km != null ? Number(r.avg_pace_seconds_per_km) : null,
    avg_power_watts: r.avg_power_watts != null ? Number(r.avg_power_watts) : null,
  }));
}

export async function getActivityWithLaps(
  userId: string,
  activityId: string
): Promise<{
  activity: Omit<typeof activities.$inferSelect, "raw">;
  laps: (typeof activityLaps.$inferSelect)[];
} | null> {
  const activityRows = await db
    .select({
      id: activities.id,
      userId: activities.userId,
      strava_id: activities.strava_id,
      name: activities.name,
      type: activities.type,
      start_date: activities.start_date,
      distance_meters: activities.distance_meters,
      moving_time_seconds: activities.moving_time_seconds,
      elapsed_time_seconds: activities.elapsed_time_seconds,
      avg_hr: activities.avg_hr,
      max_hr: activities.max_hr,
      avg_pace_seconds_per_km: activities.avg_pace_seconds_per_km,
      avg_power_watts: activities.avg_power_watts,
      elevation_gain_m: activities.elevation_gain_m,
      matched_workout_id: activities.matched_workout_id,
      created_at: activities.created_at,
      updated_at: activities.updated_at,
    })
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1);

  if (activityRows.length === 0) return null;

  const activity = activityRows[0];

  const laps = await db
    .select()
    .from(activityLaps)
    .where(eq(activityLaps.activity_id, activityId))
    .orderBy(activityLaps.lap_index);

  return { activity, laps };
}

type AggRow = { type: string; count: number; distance: number; moving_time: number };

async function fetchVolumeWindow(userId: string, days: number): Promise<VolumeRollup> {
  const rows = (await db
    .select({
      type: activities.type,
      count: sql<number>`cast(count(*) as int)`,
      distance: sql<number>`coalesce(cast(sum(${activities.distance_meters}) as float), 0)`,
      moving_time: sql<number>`coalesce(cast(sum(${activities.moving_time_seconds}) as float), 0)`,
    })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        gte(activities.start_date, sql`now() - ${days} * interval '1 day'`)
      )
    )
    .groupBy(activities.type)) as AggRow[];

  let count = 0;
  let total_distance_meters = 0;
  let total_moving_time_seconds = 0;
  const by_type: VolumeRollup["by_type"] = {};

  for (const row of rows) {
    count += Number(row.count);
    total_distance_meters += Number(row.distance);
    total_moving_time_seconds += Number(row.moving_time);
    by_type[row.type] = {
      count: Number(row.count),
      distance_meters: Number(row.distance),
      moving_time_seconds: Number(row.moving_time),
    };
  }

  return { count, total_distance_meters, total_moving_time_seconds, by_type };
}

export async function getAthleteSummary(userId: string): Promise<{
  four_week: VolumeRollup;
  twelve_week: VolumeRollup;
  fifty_two_week: VolumeRollup;
}> {
  const [four_week, twelve_week, fifty_two_week] = await Promise.all([
    fetchVolumeWindow(userId, 28),
    fetchVolumeWindow(userId, 84),
    fetchVolumeWindow(userId, 364),
  ]);

  return { four_week, twelve_week, fifty_two_week };
}
