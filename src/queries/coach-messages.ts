"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { StoredMessage } from "@/types/coach";
import { fetchJson } from "@/lib/api-client";

export function useCoachMessages(planId: string | null) {
  const qs = planId ? `?plan_id=${encodeURIComponent(planId)}` : "";
  return useSuspenseQuery({
    queryKey: ["coach", "messages", planId],
    queryFn: () =>
      fetchJson<{ messages: StoredMessage[] }>(`/api/coach/messages${qs}`).then(
        (d) => d.messages
      ),
  });
}
