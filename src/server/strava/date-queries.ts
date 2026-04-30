import { db } from "@/server/db";
import { activities } from "@/server/db/schema";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";

export type ActivityRow = typeof activities.$inferSelect;

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

/** Returns activities whose start_date falls within the inclusive ISO date range. */
export async function getActivitiesForDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ActivityRow[]> {
  return db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        gte(sql`${activities.start_date}::date`, sql`${startDate}::date`),
        lte(sql`${activities.start_date}::date`, sql`${endDate}::date`)
      )
    )
    .orderBy(asc(activities.start_date));
}
