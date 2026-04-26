"use client";

import { useEffect } from "react";
import type { UserPreferences } from "@/db/schema";

export function PreferencesCapture({
  preferences,
}: {
  preferences?: UserPreferences | null;
}) {
  const needsCapture = preferences?.timezone === "UTC";

  useEffect(() => {
    if (!needsCapture) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    fetch("/api/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        units: "mi",
        timezone: tz,
        pace_format: "min_per_mi",
        power_units: "watts",
      }),
    }).catch(() => {
      // Silent — user can fix in Settings.
    });
  }, [needsCapture]);

  return null;
}
