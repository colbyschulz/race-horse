import { mondayOf } from "@/lib/dates";
import type { WorkoutRow } from "@/types/plans";

export interface WeeklyMileage {
  mondayIso: string;
  miles: number;
}

export interface PlanStats {
  totalDistance: number;
  peakWeek: { mondayIso: string; distance: number } | null;
  longestRun: { dateIso: string; distance: number } | null;
  weeksCount: number;
}

function metersToUnits(m: number, units: "mi" | "km"): number {
  return units === "mi" ? m / 1609.344 : m / 1000;
}

/** The fields a distance total needs, so server rows and client rows both fit. */
export type VolumeRow = Pick<WorkoutRow, "sport" | "distance_meters" | "secondary">;

/**
 * Whether a session's distance belongs in the plan's totals. Only the plan's
 * own sport does: a ride in a run plan is real training, but adding its
 * distance to the running mileage would make every total meaningless.
 */
export function countsTowardVolume(session: { sport: string }, planSport: string): boolean {
  return session.sport === planSport;
}

/** A second session is the same sport as the first unless it says otherwise. */
export function secondarySport(w: Pick<WorkoutRow, "sport" | "secondary">): WorkoutRow["sport"] {
  return w.secondary?.sport ?? w.sport;
}

/** Primary session distance in meters (0 when unset or another sport). */
function primaryMeters(w: VolumeRow, planSport: string): number {
  if (w.distance_meters == null || !countsTowardVolume(w, planSport)) return 0;
  return Number(w.distance_meters);
}

/** Secondary (doubles) session distance in meters (0 when unset or another sport). */
function secondaryMeters(w: VolumeRow, planSport: string): number {
  const sec = w.secondary;
  if (sec?.distance_km == null) return 0;
  if (!countsTowardVolume({ sport: secondarySport(w) }, planSport)) return 0;
  return sec.distance_km * 1000;
}

/** Whole-day distance in the plan's sport: primary + secondary. */
export function dayMeters(w: VolumeRow, planSport: string): number {
  return primaryMeters(w, planSport) + secondaryMeters(w, planSport);
}

export function weeklyMileage(
  workouts: WorkoutRow[],
  units: "mi" | "km",
  planSport: string
): WeeklyMileage[] {
  const buckets = new Map<string, number>();
  for (const w of workouts) {
    const meters = dayMeters(w, planSport);
    if (meters <= 0) continue;
    const monday = mondayOf(w.date);
    buckets.set(monday, (buckets.get(monday) ?? 0) + meters);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([mondayIso, totalMeters]) => ({
      mondayIso,
      miles: metersToUnits(totalMeters, units),
    }));
}

export function computePlanStats(
  workouts: WorkoutRow[],
  units: "mi" | "km",
  planSport: string
): PlanStats {
  if (workouts.length === 0) {
    return { totalDistance: 0, peakWeek: null, longestRun: null, weeksCount: 0 };
  }
  const totalMeters = workouts.reduce((s, w) => s + dayMeters(w, planSport), 0);
  const weekly = weeklyMileage(workouts, units, planSport);
  const peak = weekly.reduce<WeeklyMileage | null>(
    (best, w) => (best == null || w.miles > best.miles ? w : best),
    null
  );
  // Longest single session — a double's two sessions are considered separately.
  let longest: { dateIso: string; meters: number } | null = null;
  for (const w of workouts) {
    const m = Math.max(primaryMeters(w, planSport), secondaryMeters(w, planSport));
    if (m <= 0) continue;
    if (longest == null || m > longest.meters) longest = { dateIso: w.date, meters: m };
  }
  return {
    totalDistance: metersToUnits(totalMeters, units),
    peakWeek: peak ? { mondayIso: peak.mondayIso, distance: peak.miles } : null,
    longestRun: longest
      ? { dateIso: longest.dateIso, distance: metersToUnits(longest.meters, units) }
      : null,
    weeksCount: weekly.length,
  };
}
