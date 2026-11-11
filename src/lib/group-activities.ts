import type { Activity } from "@/types/strava";
import { localDate } from "@/lib/dates";

/**
 * Bucket activities by the calendar day they started on in the athlete's
 * timezone. Used to overlay completed runs on a planned week.
 */
export function groupActivitiesByDate(
  activities: Activity[],
  timezone?: string
): Map<string, Activity[]> {
  const map = new Map<string, Activity[]>();
  for (const act of activities) {
    const date = localDate(act.start_date, timezone);
    const existing = map.get(date) ?? [];
    existing.push(act);
    map.set(date, existing);
  }
  return map;
}
