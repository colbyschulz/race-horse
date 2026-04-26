"use client";

import { useState } from "react";
import type { UserPreferences } from "@/db/schema";
import styles from "./SettingsForm.module.scss";

export function SettingsForm({ initial }: { initial: UserPreferences }) {
  const [units, setUnits] = useState<UserPreferences["units"]>(initial.units);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [paceFormat, setPaceFormat] = useState<UserPreferences["pace_format"]>(
    initial.pace_format,
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    const res = await fetch("/api/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        units,
        timezone,
        pace_format: paceFormat,
        power_units: "watts",
      }),
    });
    setStatus(res.ok ? "saved" : "error");
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="units">Units</label>
        <select
          id="units"
          className={styles.select}
          value={units}
          onChange={(e) => setUnits(e.target.value as UserPreferences["units"])}
        >
          <option value="mi">Miles (mi)</option>
          <option value="km">Kilometers (km)</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="timezone">Timezone (IANA)</label>
        <input
          id="timezone"
          className={styles.input}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="America/Los_Angeles"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="pace">Pace format</label>
        <select
          id="pace"
          className={styles.select}
          value={paceFormat}
          onChange={(e) =>
            setPaceFormat(e.target.value as UserPreferences["pace_format"])
          }
        >
          <option value="min_per_mi">Min/mile</option>
          <option value="min_per_km">Min/km</option>
        </select>
      </div>

      <button className={styles.button} type="submit">Save</button>
      {status === "saving" && <span className={styles.status}>Saving…</span>}
      {status === "saved" && <span className={styles.status}>Saved.</span>}
      {status === "error" && (
        <span className={styles.status}>Error saving — try again.</span>
      )}
    </form>
  );
}
