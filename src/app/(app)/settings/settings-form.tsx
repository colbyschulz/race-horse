"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserPreferences } from "@/types/preferences";
import { FormField } from "@/components/form-field/form-field";
import { Select } from "@/components/select/select";
import { Textarea } from "@/components/textarea/textarea";
import { usePreferences } from "@/queries/preferences";
import { useCoachNotes } from "@/queries/coach-notes";
import styles from "./settings-form.module.scss";

const NOTES_MAX_LENGTH = 4096;
const NOTES_SAVE_DELAY_MS = 500;

export function SettingsForm() {
  const qc = useQueryClient();
  const { data: prefs } = usePreferences();
  const { data: savedNotes } = useCoachNotes();

  // What the user has typed and not yet seen saved. While it is null the box
  // shows the saved notes, so a background refresh shows up on screen (the
  // coach edits these too) instead of being overwritten by an older copy.
  const [draft, setDraft] = useState<string | null>(null);
  const pendingSave = useRef<{ timer: ReturnType<typeof setTimeout>; content: string } | null>(
    null
  );

  const savePreferences = useMutation({
    mutationFn: async (next: UserPreferences) => {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          units: next.units,
          timezone: next.timezone,
          pace_format: next.pace_format,
          power_units: "watts",
        }),
      });
      if (!res.ok) throw new Error("save failed");
    },
    // Show the choice straight away; the selects read from the query.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["preferences"] });
      const previous = qc.getQueryData<UserPreferences>(["preferences"]);
      qc.setQueryData(["preferences"], next);
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) qc.setQueryData(["preferences"], context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["preferences"] }),
  });

  const saveCoachNotes = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/coach/notes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("save failed");
      return content;
    },
    onSuccess: (content) => {
      qc.setQueryData(["coach", "notes"], content);
      // Keep the draft if the user has typed more since this save went out.
      setDraft((current) => (current === content ? null : current));
    },
  });

  function saveNotesNow() {
    const pending = pendingSave.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingSave.current = null;
    saveCoachNotes.mutate(pending.content);
  }

  function onNotesChange(value: string) {
    const content = value.slice(0, NOTES_MAX_LENGTH);
    setDraft(content);
    if (pendingSave.current) clearTimeout(pendingSave.current.timer);
    pendingSave.current = { content, timer: setTimeout(saveNotesNow, NOTES_SAVE_DELAY_MS) };
  }

  const notes = draft ?? savedNotes;
  const isSaving = savePreferences.isPending || saveCoachNotes.isPending;
  const hasError = savePreferences.isError || saveCoachNotes.isError;
  const hasSaved = savePreferences.isSuccess || saveCoachNotes.isSuccess;

  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <FormField label="Units" htmlFor="units">
        <Select
          id="units"
          value={prefs.units}
          onChange={(v) =>
            savePreferences.mutate({ ...prefs, units: v as UserPreferences["units"] })
          }
          options={[
            { value: "mi", label: "Miles (mi)" },
            { value: "km", label: "Kilometers (km)" },
          ]}
        />
      </FormField>

      <FormField label="Pace format" htmlFor="pace">
        <Select
          id="pace"
          value={prefs.pace_format}
          onChange={(v) =>
            savePreferences.mutate({
              ...prefs,
              pace_format: v as UserPreferences["pace_format"],
            })
          }
          options={[
            { value: "min_per_mi", label: "Min/mile" },
            { value: "min_per_km", label: "Min/km" },
          ]}
        />
      </FormField>

      <FormField label="Coach notes" htmlFor="coach-notes">
        <Textarea
          id="coach-notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          // Leaving the box (including tapping another tab) saves at once, so
          // an edit made in the last half second isn't lost.
          onBlur={saveNotesNow}
          rows={10}
        />
        <div className={styles.counterRow}>
          <span className={styles.counter}>
            {notes.length} / {NOTES_MAX_LENGTH}
          </span>
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
