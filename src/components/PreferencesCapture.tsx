"use client";

import { useEffect } from "react";

export function PreferencesCapture({ needsCapture }: { needsCapture: boolean }) {
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
