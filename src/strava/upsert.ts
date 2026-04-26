import { db } from "@/db";
import { activities, activityLaps } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ActivityInsertRow, LapInsertRow } from "./normalize";

export async function upsertActivity(row: ActivityInsertRow): Promise<string> {
  const result = await db
    .insert(activities)
    .values({ ...row, updated_at: new Date() })
    .onConflictDoUpdate({
      target: activities.strava_id,
      set: {
        name: row.name,
        type: row.type,
        start_date: row.start_date,
        distance_meters: row.distance_meters,
        moving_time_seconds: row.moving_time_seconds,
        elapsed_time_seconds: row.elapsed_time_seconds,
        avg_hr: row.avg_hr,
        max_hr: row.max_hr,
        avg_pace_seconds_per_km: row.avg_pace_seconds_per_km,
        avg_power_watts: row.avg_power_watts,
        elevation_gain_m: row.elevation_gain_m,
        raw: row.raw,
        updated_at: new Date(),
      },
    })
    .returning({ id: activities.id });

  return result[0].id;
}

export async function replaceLaps(
  activityId: string,
  laps: LapInsertRow[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(activityLaps).where(eq(activityLaps.activity_id, activityId));
    if (laps.length > 0) {
      await tx.insert(activityLaps).values(laps);
    }
  });
}

export async function deleteActivityByStravaId(stravaId: number): Promise<void> {
  await db.delete(activities).where(eq(activities.strava_id, stravaId));
}
