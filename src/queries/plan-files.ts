"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ApiError, fetchJson } from "@/lib/api-client";

export interface PlanFileResponse {
  id: string;
  status: "extracting" | "extracted" | "failed";
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  extraction_error: string | null;
  extracted_payload: unknown;
  extracted_plan_id: string | null;
  created_at: string;
}

const POLL_MS = 2000;

/**
 * An uploaded plan file. Pass `pollWhile` to keep re-reading it for as long as
 * the predicate holds, e.g. while extraction is still running.
 */
export function usePlanFile(id: string, pollWhile?: (file: PlanFileResponse) => boolean) {
  return useSuspenseQuery({
    queryKey: ["plan-files", id],
    queryFn: async () => {
      try {
        return await fetchJson<PlanFileResponse>(`/api/plans/upload/${id}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    refetchInterval: (query) => {
      const file = query.state.data;
      return file && pollWhile?.(file) ? POLL_MS : false;
    },
  });
}
