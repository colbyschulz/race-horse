"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

export function useCoachNotes() {
  return useSuspenseQuery({
    queryKey: ["coach", "notes"],
    queryFn: () =>
      fetchJson<{ content: string }>("/api/coach/notes").then((d) => d.content),
  });
}
