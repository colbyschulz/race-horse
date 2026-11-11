"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

export interface Me {
  name: string;
  synced: boolean;
}

const SYNC_POLL_MS = 5000;

/**
 * The signed-in user. Not a suspense query: the app shell renders without it
 * and fills in the name and sync banner once it arrives. Polls while the first
 * Strava backfill is still running.
 */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => fetchJson<Me>("/api/me"),
    refetchInterval: (query) => (query.state.data?.synced === false ? SYNC_POLL_MS : false),
  });
}
