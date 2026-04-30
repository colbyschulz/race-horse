"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";

/**
 * Client-only Suspense boundary. Renders the fallback during SSR and the first
 * commit, then the suspense subtree on the client. Used so `useSuspenseQuery`
 * fns (which call `fetch` with relative URLs) never execute on the server.
 */
export function CSRSuspense({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mount detection
    setMounted(true);
  }, []);
  if (!mounted) return <>{fallback}</>;
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
