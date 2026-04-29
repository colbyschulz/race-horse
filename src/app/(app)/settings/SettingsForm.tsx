"use client";

import { useState } from "react";
import type { UserPreferences } from "@/db/schema";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { Select } from "@/components/Select";
import styles from "./SettingsForm.module.scss";

export function SettingsForm({ initial }: { initial: UserPreferences }) {
  const [units, setUnits] = useState<UserPreferences["units"]>(initial.units);
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
        timezone: initial.timezone,
        pace_format: paceFormat,
        power_units: "watts",
      }),
    });
    setStatus(res.ok ? "saved" : "error");
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <FormField label="Units" htmlFor="units">
        <Select
          id="units"
          value={units}
          onChange={(e) => setUnits(e.target.value as UserPreferences["units"])}
        >
          <option value="mi">Miles (mi)</option>
          <option value="km">Kilometers (km)</option>
        </Select>
      </FormField>

      <FormField label="Pace format" htmlFor="pace">
        <Select
          id="pace"
          value={paceFormat}
          onChange={(e) =>
            setPaceFormat(e.target.value as UserPreferences["pace_format"])
          }
        >
          <option value="min_per_mi">Min/mile</option>
          <option value="min_per_km">Min/km</option>
        </Select>
      </FormField>

      <Button type="submit" variant="primary" loading={status === "saving"} className={styles.submit}>
        Save
      </Button>
      {status === "saving" && <span className={styles.status}>Saving…</span>}
      {status === "saved" && <span className={styles.status}>Saved.</span>}
      {status === "error" && (
        <span className={styles.status}>Error saving — try again.</span>
      )}
    </form>
  );
}
