"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserPreferences } from "@/types/preferences";
import { FormField } from "@/components/form-field/form-field";
import { Select } from "@/components/select/select";
import { Textarea } from "@/components/textarea/textarea";
import { usePreferences } from "@/queries/preferences";
import { useCoachNotes } from "@/queries/coach-notes";
import styles from "./settings-form.module.scss";

export function SettingsForm() {
  const qc = useQueryClient();
  const { data: prefs } = usePreferences();
  const { data: initialCoachNotes } = useCoachNotes();

  const [units, setUnits] = useState<UserPreferences["units"]>(prefs.units);
  const [paceFormat, setPaceFormat] = useState<UserPreferences["pace_format"]>(prefs.pace_format);
  const [coachNotes, setCoachNotes] = useState(initialCoachNotes);

  const savePreferences = useMutation({
    mutationFn: async (next: {
      units: UserPreferences["units"];
      paceFormat: UserPreferences["pace_format"];
    }) => {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          units: next.units,
          timezone: prefs.timezone,
          pace_format: next.paceFormat,
          power_units: "watts",
        }),
      });
      if (!res.ok) throw new Error("save failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["preferences"] }),
  });

  const saveCoachNotes = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/coach/notes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("save failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coach", "notes"] }),
  });

  // Debounce coach-notes saves: skip when nothing changed (also skips initial mount).
  useEffect(() => {
    if (coachNotes === initialCoachNotes) return;
    const handle = setTimeout(() => saveCoachNotes.mutate(coachNotes), 500);
    return () => clearTimeout(handle);
  }, [coachNotes, initialCoachNotes, saveCoachNotes]);

  const isSaving = savePreferences.isPending || saveCoachNotes.isPending;
  const hasError = savePreferences.isError || saveCoachNotes.isError;
  const hasSaved = savePreferences.isSuccess || saveCoachNotes.isSuccess;

  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <FormField label="Units" htmlFor="units">
        <Select
          id="units"
          value={units}
          onChange={(v) => {
            const next = v as UserPreferences["units"];
            setUnits(next);
            savePreferences.mutate({ units: next, paceFormat });
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
            savePreferences.mutate({ units, paceFormat: next });
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
            {isSaving && "Saving…"}
            {!isSaving && hasError && "Save failed — try again."}
            {!isSaving && !hasError && hasSaved && "Saved."}
          </span>
        </div>
      </FormField>
    </form>
  );
}
