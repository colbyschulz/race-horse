"use client";

import { useSyncExternalStore } from "react";

/** Chrome's offer of its own install dialog. Not in TypeScript's DOM types. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

export type InstallPlatform = "ios" | "android" | "other";

export function installPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  // An iPad reports itself as a Mac; a "Mac" with a touch screen is an iPad.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "other";
}

/**
 * How this device can add the app to its home screen:
 * - "installed": it already runs from the home screen, so there is nothing to offer.
 * - "prompt": the browser has offered its own install dialog, so a button can open it.
 * - "ios" / "android": no dialog is available; the athlete follows the browser's own steps.
 * - "none": a device with no home screen to add to.
 */
export type InstallOffer = "installed" | "prompt" | "ios" | "android" | "none";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let watching = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function runsFromHomeScreen(): boolean {
  if (installed) return true;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS reports it here instead of through the media query.
  return (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Starts listening for the browser's install offer. Called once when the app
 * starts, because the offer can arrive long before anything that uses it is on
 * screen. The browser's own install banner is left alone.
 */
export function watchInstall() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", emit);
}

function subscribe(listener: () => void) {
  watchInstall();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function currentOffer(): InstallOffer {
  if (runsFromHomeScreen()) return "installed";
  if (deferred) return "prompt";
  const platform = installPlatform(navigator.userAgent, navigator.maxTouchPoints);
  return platform === "other" ? "none" : platform;
}

export function useInstallOffer(): InstallOffer {
  // Nothing is known on the server, so nothing is offered until the page is live.
  return useSyncExternalStore(subscribe, currentOffer, () => "none");
}

/** Opens the browser's install dialog. An offer can be used once. */
export async function promptInstall() {
  const event = deferred;
  if (!event) return;
  deferred = null;
  try {
    await event.prompt();
  } catch (err) {
    console.error(err);
  } finally {
    emit();
  }
}
