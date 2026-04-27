import { getAthleteSummary, listRecentActivities } from "@/strava/queries";

export type StravaPreload = {
  athlete_summary: Awaited<ReturnType<typeof getAthleteSummary>>;
  recent_activities_summary: {
    count: number;
    total_distance_meters: number;
    total_moving_time_seconds: number;
  };
  minimal: boolean;
};

const MINIMAL_THRESHOLD_12W = 4;

export async function fetchStravaPreload(userId: string): Promise<StravaPreload> {
  const [athlete_summary, recentActivities] = await Promise.all([
    getAthleteSummary(userId),
    listRecentActivities(userId, 84),
  ]);

  const recent_activities_summary = {
    count: recentActivities.length,
    total_distance_meters: recentActivities.reduce((acc, r) => acc + (r.distance_meters ?? 0), 0),
    total_moving_time_seconds: recentActivities.reduce((acc, r) => acc + (r.moving_time_seconds ?? 0), 0),
  };

  const minimal = athlete_summary.twelve_week.count < MINIMAL_THRESHOLD_12W;

  return { athlete_summary, recent_activities_summary, minimal };
}
