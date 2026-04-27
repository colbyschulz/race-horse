import { mondayOf } from "@/lib/dates";
import type { WorkoutRow } from "./dateQueries";

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

export function weeklyMileage(workouts: WorkoutRow[], units: "mi" | "km"): WeeklyMileage[] {
  const buckets = new Map<string, number>();
  for (const w of workouts) {
    const meters = w.distance_meters == null ? 0 : Number(w.distance_meters);
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

export function computePlanStats(workouts: WorkoutRow[], units: "mi" | "km"): PlanStats {
  if (workouts.length === 0) {
    return { totalDistance: 0, peakWeek: null, longestRun: null, weeksCount: 0 };
  }
  const totalMeters = workouts.reduce(
    (s, w) => s + (w.distance_meters == null ? 0 : Number(w.distance_meters)),
    0,
  );
  const weekly = weeklyMileage(workouts, units);
  const peak = weekly.reduce<WeeklyMileage | null>(
    (best, w) => (best == null || w.miles > best.miles ? w : best),
    null,
  );
  let longest: { dateIso: string; meters: number } | null = null;
  for (const w of workouts) {
    if (w.distance_meters == null) continue;
    const m = Number(w.distance_meters);
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
