"use client";

import { Suspense, useSyncExternalStore, type ReactNode } from "react";
import { useIsRestoring } from "@tanstack/react-query";

const noop = () => () => {};

/**
 * Client-only Suspense boundary. Renders the fallback during SSR and the first
 * commit, then the suspense subtree on the client. Used so `useSuspenseQuery`
 * fns (which call `fetch` with relative URLs) never execute on the server.
 *
 * Uses useSyncExternalStore instead of useState+useEffect so that after initial
 * hydration, navigating to a page returns `true` synchronously — no extra render
 * cycle, no skeleton flash when data is already cached.
 *
 * Also holds the fallback while the saved query cache is being read back from
 * storage. Rendering the subtree before that finishes would suspend on a
 * network request for data that is about to arrive from storage.
 */
export function CSRSuspense({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const isClient = useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
  const isRestoring = useIsRestoring();
  if (!isClient || isRestoring) return <>{fallback}</>;
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
