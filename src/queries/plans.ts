"use client";

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
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

async function fetchPlan(id: string): Promise<PlanRow | null> {
  try {
    const data = await fetchJson<{ plan: PlanRow }>(`/api/plans/${id}`);
    return data.plan;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function usePlan(id: string) {
  return useSuspenseQuery({ queryKey: ["plans", id], queryFn: () => fetchPlan(id) });
}

/** The same plan without suspending, for a part of a screen that can render before it loads. */
export function usePlanIfLoaded(id: string) {
  return useQuery({ queryKey: ["plans", id], queryFn: () => fetchPlan(id) });
}

/**
 * Makes a plan the active one, or sets the active plan aside. Which plan is
 * active decides what Today and Training show, so both are re-read afterwards;
 * the mutation stays pending until they have been.
 */
export function useSetPlanActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, active }: { planId: string; active: boolean }) => {
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: active }),
      });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["plans"] }),
        queryClient.invalidateQueries({ queryKey: ["workouts"] }),
      ]),
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
