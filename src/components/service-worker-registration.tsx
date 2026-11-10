"use client";
import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    }
  }, []);
  return null;
}

// Rendered by the sign-in page. The service worker keeps the last signed-in
// pages so the app can launch from cache; drop them once the user is signed out.
export function ClearCachedShell() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.active?.postMessage({ type: "rh-clear-shell" }))
      .catch(() => {});
  }, []);
  return null;
}
