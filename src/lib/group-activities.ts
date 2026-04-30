import type { Activity } from "@/types/strava";

/**
 * Bucket activities by their YYYY-MM-DD date. Used to overlay completed runs
 * on a planned week.
 */
export function groupActivitiesByDate(activities: Activity[]): Map<string, Activity[]> {
  const map = new Map<string, Activity[]>();
  for (const act of activities) {
    const date = act.start_date.slice(0, 10);
    const existing = map.get(date) ?? [];
    existing.push(act);
    map.set(date, existing);
  }
  return map;
}
