"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { Activity } from "@/types/strava";
import { fetchJson } from "@/lib/api-client";

export function useActivities(from: string, to: string) {
  return useSuspenseQuery({
    queryKey: ["activities", { from, to }],
    queryFn: () =>
      fetchJson<{ activities: Activity[] }>(`/api/activities?from=${from}&to=${to}`).then(
        (d) => d.activities
      ),
  });
}
