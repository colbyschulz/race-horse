// Re-exports of cross-boundary strava types so client code never imports from @/server/.
export type {
  StravaActivityType,
  StravaSummaryActivity,
  StravaLap,
  StravaDetailedActivity,
  StravaTokenResponse,
  StravaWebhookEvent,
} from "@/server/strava/types";

export type { Activity, ActivityRow } from "@/server/strava/date-queries";
