import { db } from "@/db";
import { activities } from "@/db/schema";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";

export type ActivityRow = typeof activities.$inferSelect;

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
