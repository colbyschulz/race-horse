import "server-only";

// src/plans/materialize.ts
import { addDays } from "@/lib/dates";
import type { TargetIntensity, IntervalSpec } from "@/server/db/schema";
import type { Sport } from "./types";

export type ExtractedWorkout = {
  day_offset: number;
  sport: Sport;
  type:
    | "easy"
    | "long"
    | "tempo"
    | "threshold"
    | "intervals"
    | "recovery"
    | "race"
    | "rest"
    | "cross";
  distance_meters: number | null;
  duration_seconds: number | null;
  target_intensity: TargetIntensity | null;
  intervals: IntervalSpec[] | null;
  notes: string;
};

export type MaterializedWorkout = Omit<ExtractedWorkout, "day_offset"> & {
  date: string; // YYYY-MM-DD
};

export function materializeWorkouts(
  startDate: string,
  workouts: ExtractedWorkout[]
): MaterializedWorkout[] {
  return workouts.map((w) => {
    const { day_offset, ...rest } = w;
    return { ...rest, date: addDays(startDate, day_offset) };
  });
}

export function computeEndDate(workouts: MaterializedWorkout[]): string {
  if (workouts.length === 0) {
    throw new Error("computeEndDate: empty workouts array");
  }
  return workouts.reduce((max, w) => (w.date > max ? w.date : max), workouts[0].date);
}
