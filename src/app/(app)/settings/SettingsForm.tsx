"use client";

import { useEffect, useRef, useState } from "react";
import type { UserPreferences } from "@/db/schema";
import { FormField } from "@/components/FormField";
import { Select } from "@/components/Select";
import { Textarea } from "@/components/Textarea";
import styles from "./SettingsForm.module.scss";

interface Props {
  initialPreferences: UserPreferences;
  initialCoachNotes: string;
}

type Status = "idle" | "saving" | "saved" | "error";

export function SettingsForm({ initialPreferences, initialCoachNotes }: Props) {
  const [units, setUnits] = useState<UserPreferences["units"]>(initialPreferences.units);
  const [paceFormat, setPaceFormat] = useState<UserPreferences["pace_format"]>(
    initialPreferences.pace_format
  );
  const [coachNotes, setCoachNotes] = useState(initialCoachNotes);
  const [status, setStatus] = useState<Status>("idle");

  const initialPrefsRef = useRef(initialPreferences);

  async function savePreferences(next: {
    units: UserPreferences["units"];
    paceFormat: UserPreferences["pace_format"];
  }) {
    setStatus("saving");
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          units: next.units,
          timezone: initialPrefsRef.current.timezone,
          pace_format: next.paceFormat,
          power_units: "watts",
        }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  async function saveCoachNotes(content: string) {
    setStatus("saving");
    try {
      const res = await fetch("/api/coach/notes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  // Debounce coach-notes saves (500ms after last change). Skip the initial mount.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const handle = setTimeout(() => {
      saveCoachNotes(coachNotes);
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachNotes]);

  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <FormField label="Units" htmlFor="units">
        <Select
          id="units"
          value={units}
          onChange={(v) => {
            const next = v as UserPreferences["units"];
            setUnits(next);
            savePreferences({ units: next, paceFormat });
          }}
          options={[
            { value: "mi", label: "Miles (mi)" },
            { value: "km", label: "Kilometers (km)" },
          ]}
        />
      </FormField>

      <FormField label="Pace format" htmlFor="pace">
        <Select
          id="pace"
          value={paceFormat}
          onChange={(v) => {
            const next = v as UserPreferences["pace_format"];
            setPaceFormat(next);
            savePreferences({ units, paceFormat: next });
          }}
          options={[
            { value: "min_per_mi", label: "Min/mile" },
            { value: "min_per_km", label: "Min/km" },
          ]}
        />
      </FormField>

      <FormField label="Coach notes" htmlFor="coach-notes">
        <Textarea
          id="coach-notes"
          value={coachNotes}
          onChange={(e) => setCoachNotes(e.target.value.slice(0, 4096))}
          rows={10}
        />
        <div className={styles.counterRow}>
          <span className={styles.counter}>{coachNotes.length} / 4096</span>
          <span className={styles.spacer} />
          <span className={styles.status} aria-live="polite">
            {status === "saving" && "Saving…"}
            {status === "saved" && "Saved."}
            {status === "error" && "Save failed — try again."}
          </span>
        </div>
      </FormField>
    </form>
  );
}
