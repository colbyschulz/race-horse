"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CSRSuspense } from "@/lib/csr-suspense";
import { usePreferences } from "@/queries/preferences";

export function PreferencesCapture() {
  return (
    <CSRSuspense fallback={null}>
      <PreferencesCaptureInner />
    </CSRSuspense>
  );
}

function PreferencesCaptureInner() {
  const qc = useQueryClient();
  const { data: prefs } = usePreferences();
  const needsCapture = prefs.timezone === "UTC";

  useEffect(() => {
    if (!needsCapture) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    if (tz === "UTC") return;
    fetch("/api/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        units: prefs.units,
        timezone: tz,
        pace_format: prefs.pace_format,
        power_units: "watts",
      }),
    })
      .then(() => qc.invalidateQueries({ queryKey: ["preferences"] }))
      .catch(() => {
        // Silent — user can fix in Settings.
      });
  }, [needsCapture, prefs.units, prefs.pace_format, qc]);

  return null;
}
