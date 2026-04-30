"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { PlanRow, WorkoutRow } from "@/types/plans";
import type { PlanWithCounts } from "@/types/plans";
import { ApiError, fetchJson } from "@/lib/api-client";

export interface PlanFile {
  id: string;
  status: "extracting" | "extracted" | "failed";
  original_filename: string;
  extraction_error: string | null;
}

export function useActivePlan() {
  return useSuspenseQuery({
    queryKey: ["plans", "active"],
    queryFn: () =>
      fetchJson<{ plan: PlanRow | null }>("/api/plans/active").then((d) => d.plan),
  });
}

export function usePlans() {
  return useSuspenseQuery({
    queryKey: ["plans", "list"],
    queryFn: () =>
      fetchJson<{ plans: PlanWithCounts[] }>("/api/plans").then((d) => d.plans),
  });
}

export function useInFlightPlanFiles() {
  return useSuspenseQuery({
    queryKey: ["plans", "files"],
    queryFn: () =>
      fetchJson<{ files: PlanFile[] }>("/api/plans/files").then((d) => d.files),
  });
}

export function usePlan(id: string) {
  return useSuspenseQuery({
    queryKey: ["plans", id],
    queryFn: async () => {
      try {
        const data = await fetchJson<{ plan: PlanRow }>(`/api/plans/${id}`);
        return data.plan;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function usePlanWorkouts(id: string) {
  return useSuspenseQuery({
    queryKey: ["plans", id, "workouts"],
    queryFn: () =>
      fetchJson<{ workouts: WorkoutRow[] }>(`/api/plans/${id}/workouts`).then(
        (d) => d.workouts
      ),
  });
}
