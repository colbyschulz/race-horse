"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ROUTES = ["/today", "/training", "/plans", "/settings"];

export function PrefetchOnResume() {
  const router = useRouter();

  useEffect(() => {
    function prefetchAll() {
      for (const route of ROUTES) {
        router.prefetch(route);
      }
    }

    // Prefetch immediately on mount (first load)
    prefetchAll();

    // Re-prefetch whenever the app comes back to the foreground
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        prefetchAll();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);

  return null;
}
