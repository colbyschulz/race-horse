"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { WorkoutRow } from "@/types/plans";
import { fetchJson } from "@/lib/api-client";

export function useWorkouts(from: string, to: string) {
  return useSuspenseQuery({
    queryKey: ["workouts", { from, to }],
    queryFn: () =>
      fetchJson<{ workouts: WorkoutRow[] }>(`/api/workouts?from=${from}&to=${to}`).then(
        (d) => d.workouts
      ),
  });
}

export function useNextWorkouts(after: string, limit = 1) {
  return useSuspenseQuery({
    queryKey: ["workouts", "next", { after, limit }],
    queryFn: () =>
      fetchJson<{ workouts: WorkoutRow[] }>(`/api/workouts?after=${after}&limit=${limit}`).then(
        (d) => d.workouts
      ),
  });
}
