import type {
  StravaDetailedActivity,
  StravaLap,
  StravaSummaryActivity,
} from "./types";

// Drizzle's `numeric` columns round-trip as strings to preserve precision.
// We mirror that here so callers can pass the result straight to .insert().
type NumericString = string;

export interface ActivityInsertRow {
  userId: string;
  strava_id: number;
  start_date: Date;
  name: string;
  type: string;
  distance_meters: NumericString | null;
  moving_time_seconds: number | null;
  elapsed_time_seconds: number | null;
  avg_hr: NumericString | null;
  max_hr: NumericString | null;
  avg_pace_seconds_per_km: NumericString | null;
  avg_power_watts: NumericString | null;
  elevation_gain_m: NumericString | null;
  raw: unknown;
}

export interface LapInsertRow {
  activity_id: string;
  lap_index: number;
  distance_meters: NumericString;
  moving_time_seconds: number;
  elapsed_time_seconds: number;
  avg_pace_seconds_per_km: NumericString | null;
  avg_power_watts: NumericString | null;
  avg_hr: NumericString | null;
  max_hr: NumericString | null;
  elevation_gain_m: NumericString | null;
  start_index: number | null;
  end_index: number | null;
}

const num = (v: number | undefined | null): NumericString | null =>
  v === undefined || v === null ? null : String(v);

const paceFromSpeed = (
  metersPerSecond: number | undefined,
): NumericString | null => {
  if (!metersPerSecond || metersPerSecond <= 0) return null;
  return (1000 / metersPerSecond).toFixed(2);
};

export function normalizeActivity(
  a: StravaSummaryActivity | StravaDetailedActivity,
  userId: string,
): ActivityInsertRow {
  return {
    userId,
    strava_id: a.id,
    start_date: new Date(a.start_date),
    name: a.name,
    type: a.type,
    distance_meters: num(a.distance),
    moving_time_seconds: a.moving_time ?? null,
    elapsed_time_seconds: a.elapsed_time ?? null,
    avg_hr: num(a.average_heartrate),
    max_hr: num(a.max_heartrate),
    avg_pace_seconds_per_km: paceFromSpeed(a.average_speed),
    avg_power_watts: num(a.average_watts),
    elevation_gain_m: num(a.total_elevation_gain),
    raw: a,
  };
}

export function normalizeLap(lap: StravaLap, activityId: string): LapInsertRow {
  return {
    activity_id: activityId,
    lap_index: lap.lap_index,
    distance_meters: String(lap.distance),
    moving_time_seconds: lap.moving_time,
    elapsed_time_seconds: lap.elapsed_time,
    avg_pace_seconds_per_km: paceFromSpeed(lap.average_speed),
    avg_power_watts: num(lap.average_watts),
    avg_hr: num(lap.average_heartrate),
    max_hr: num(lap.max_heartrate),
    elevation_gain_m: num(lap.total_elevation_gain),
    start_index: lap.start_index ?? null,
    end_index: lap.end_index ?? null,
  };
}
