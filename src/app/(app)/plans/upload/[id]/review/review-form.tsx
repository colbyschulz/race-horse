// src/app/(app)/plans/upload/[id]/review/ReviewForm.tsx
"use client";
import { useState, useMemo } from "react";
import type { ExtractedPlan } from "@/extraction/schema";
import type { WorkoutRow } from "@/plans/date-queries";
import { addDays } from "@/lib/dates";
import { usePlanWeekNav } from "@/lib/use-plan-week-nav";
import { Button } from "@/components/button/button";
import { PlanView } from "@/components/plans/plan-view";
import { WorkoutDetailSheet } from "@/components/workouts/workout-detail-sheet";
import styles from "./review.module.scss";

interface Props {
  fileId: string;
  payload: ExtractedPlan;
  units: "mi" | "km";
  today: string;
  hasActivePlan: boolean;
  onDiscarded: () => void;
  onSaved: (planId: string) => void;
}

function toWorkoutRow(w: ExtractedPlan["workouts"][number], date: string, idx: number): WorkoutRow {
  return {
    id: `preview-${idx}`,
    plan_id: "preview",
    date,
    sport: w.sport,
    type: w.type,
    distance_meters: w.distance_meters == null ? null : String(w.distance_meters),
    duration_seconds: w.duration_seconds,
    target_intensity: w.target_intensity,
    intervals: w.intervals,
    notes: w.notes,
  };
}

export function ReviewForm({
  fileId,
  payload,
  units,
  today,
  hasActivePlan,
  onDiscarded,
  onSaved,
}: Props) {
  const [setActive, setSetActive] = useState(!hasActivePlan);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDate = payload.tentative_start_date ?? today;

  const allWorkoutRows = useMemo<WorkoutRow[]>(() => {
    return payload.workouts.map((w, i) => {
      const date = addDays(startDate, w.day_offset);
      return toWorkoutRow(w, date, i);
    });
  }, [payload.workouts, startDate]);

  const planEndDate = useMemo(() => {
    if (allWorkoutRows.length === 0) return null;
    return allWorkoutRows.reduce((max, w) => (w.date > max ? w.date : max), allWorkoutRows[0].date);
  }, [allWorkoutRows]);

  const weekNav = usePlanWeekNav(startDate, planEndDate);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const openWorkout = openDate ? (allWorkoutRows.find((w) => w.date === openDate) ?? null) : null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/upload/${fileId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          sport: payload.sport,
          mode: payload.mode,
          goal: payload.goal,
          start_date: startDate,
          set_active: setActive,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to save plan");
        return;
      }
      const data = (await res.json()) as { plan_id: string };
      onSaved(data.plan_id);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscard() {
    setDiscarding(true);
    setError(null);
    try {
      await fetch(`/api/plans/upload/${fileId}`, { method: "DELETE" });
      onDiscarded();
    } catch {
      setError("Network error — please try again");
      setDiscarding(false);
    }
  }

  const busy = saving || discarding;

  const planLike = {
    title: payload.title,
    sport: payload.sport,
    start_date: startDate,
    end_date: planEndDate,
    mode: payload.mode,
    goal: payload.goal ?? null,
  };

  return (
    <>
      <PlanView
        plan={planLike}
        today={today}
        units={units}
        allWorkouts={allWorkoutRows}
        actionsBar={
          <>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={setActive}
                onChange={(e) => setSetActive(e.target.checked)}
              />
              Set active
            </label>
            {confirmDiscard ? (
              <>
                <span className={styles.confirmLabel}>Discard?</span>
                <Button
                  variant="danger"
                  disabled={busy}
                  loading={discarding}
                  onClick={handleDiscard}
                >
                  {discarding ? "Discarding…" : "Yes"}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirmDiscard(false)}>
                  No
                </Button>
              </>
            ) : (
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmDiscard(true)}>
                Discard
              </Button>
            )}
            <Button variant="primary" disabled={busy} loading={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
        banner={error ? <p className={styles.errorBanner}>{error}</p> : undefined}
        currentWeek={{
          monday: weekNav.monday,
          prev: weekNav.prevDisabled ? { disabled: true } : { onClick: weekNav.goToPrev },
          next: weekNav.nextDisabled ? { disabled: true } : { onClick: weekNav.goToNext },
          showToday: false,
          isActivePlan: false,
          onWorkoutClick: setOpenDate,
        }}
      />
      <WorkoutDetailSheet workout={openWorkout} units={units} onClose={() => setOpenDate(null)} />
    </>
  );
}
