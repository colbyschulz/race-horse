"use client";
import { useEffect } from "react";
import { QUERY_CACHE_STORAGE_KEY } from "@/lib/query-cache-key";
import { watchInstall } from "@/lib/install";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // The browser can offer to install the app at any point after load, so
    // listen from the start; Settings is where the offer gets used.
    watchInstall();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    }
  }, []);
  return null;
}

// Rendered by the sign-in page. The device keeps the last signed-in pages (in
// the service worker) and their data (the saved React Query cache) so the app
// can launch without the network; drop both once the user is signed out.
export function ClearCachedShell() {
  useEffect(() => {
    try {
      localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private browsing; nothing to clear then.
    }
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.active?.postMessage({ type: "rh-clear-shell" }))
      .catch(() => {});
  }, []);
  return null;
}
