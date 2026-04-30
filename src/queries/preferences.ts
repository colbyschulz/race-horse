"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { UserPreferences } from "@/types/preferences";
import { fetchJson } from "@/lib/api-client";

export function usePreferences() {
  return useSuspenseQuery({
    queryKey: ["preferences"],
    queryFn: () => fetchJson<{ preferences: UserPreferences }>("/api/preferences").then((d) => d.preferences),
  });
}
