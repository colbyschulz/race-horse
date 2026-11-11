import { db } from "@/server/db";
import { activities } from "@/server/db/schema";
import { and, asc, eq, getTableColumns, gte, lt, sql } from "drizzle-orm";

// Everything except `raw`, the full Strava payload kept for reprocessing. It
// is tens of kilobytes per activity and nothing that reads these rows uses it,
// so it stays out of API responses and the cache saved on the device.
const { raw: _raw, ...activityColumns } = getTableColumns(activities);

export type ActivityRow = Omit<typeof activities.$inferSelect, "raw">;

/**
 * Wire-format Activity used on the client. The DB row (ActivityRow) has
 * Date instances; after JSON serialization those become ISO strings, which
 * is what client code consumes.
 */
export type Activity = Omit<ActivityRow, "start_date" | "created_at" | "updated_at"> & {
  start_date: string;
  created_at: string;
  updated_at: string;
};

/**
 * Returns activities that started on the given calendar days (inclusive), where
 * a "day" is the athlete's own: the range runs from local midnight at the start
 * of `startDate` to local midnight after `endDate`. Comparing the stored
 * instant against those two bounds, rather than casting the column to a date,
 * also lets the (userId, start_date) index do the work.
 */
export async function getActivitiesForDateRange(
  userId: string,
  startDate: string,
  endDate: string,
  timezone: string = "UTC"
): Promise<ActivityRow[]> {
  return db
    .select(activityColumns)
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        gte(activities.start_date, sql`(${startDate}::date::timestamp AT TIME ZONE ${timezone})`),
        lt(activities.start_date, sql`((${endDate}::date + 1)::timestamp AT TIME ZONE ${timezone})`)
      )
    )
    .orderBy(asc(activities.start_date));
}
