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

export function usePlanFile(id: string) {
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
  });
}
