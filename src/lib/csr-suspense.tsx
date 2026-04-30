"use client";

import { Suspense, useSyncExternalStore, type ReactNode } from "react";

const noop = () => () => {};

/**
 * Client-only Suspense boundary. Renders the fallback during SSR and the first
 * commit, then the suspense subtree on the client. Used so `useSuspenseQuery`
 * fns (which call `fetch` with relative URLs) never execute on the server.
 *
 * Uses useSyncExternalStore instead of useState+useEffect so that after initial
 * hydration, navigating to a page returns `true` synchronously — no extra render
 * cycle, no skeleton flash when data is already cached.
 */
export function CSRSuspense({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  if (!isClient) return <>{fallback}</>;
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
