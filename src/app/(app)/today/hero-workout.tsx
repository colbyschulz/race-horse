"use client";

import { WorkoutBadge, type WorkoutType } from "@/components/workouts/workout-badge";
import type { TargetIntensity } from "@/types/preferences";
import { formatDistance, formatDuration, formatPaceRange } from "@/lib/format";
import { useWorkouts } from "@/queries/workouts";
import styles from "./today.module.scss";

const TYPE_HEADLINE: Record<WorkoutType, string> = {
  easy: "Easy Run",
  long: "Long Run",
  tempo: "Tempo Run",
  threshold: "Threshold",
  intervals: "Intervals",
  recovery: "Recovery",
  race: "Race Day",
  rest: "Rest",
  cross: "Cross Train",
};

export function HeroWorkout({ units, today }: { units: "mi" | "km"; today: string }) {
  const { data: workouts } = useWorkouts(today, today);
  if (workouts.length === 0) {
    return <div className={styles.restCard}>Rest day. Take it easy.</div>;
  }
  const workout = workouts[0];
  const hasNotes = !!workout.notes;
  const intensity: TargetIntensity | null = hasNotes
    ? null
    : ((workout.target_intensity as TargetIntensity | null) ?? null);
  const pace = intensity?.pace ? formatPaceRange(intensity.pace, units) : null;

  return (
    <article className={styles.hero}>
      <div className={styles.heroHead}>
        <WorkoutBadge type={workout.type} />
      </div>
      <h2 className={styles.headline}>{TYPE_HEADLINE[workout.type] ?? workout.type}</h2>
      <div className={styles.statRow}>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {formatDistance(workout.distance_meters as string | null, units) ?? "—"}
          </span>
          <span className={styles.statUnit}>{units}</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {formatDuration(workout.duration_seconds) ?? "—"}
          </span>
          <span className={styles.statUnit}>time</span>
        </div>
        {pace && (
          <>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statValue}>{pace}</span>
              <span className={styles.statUnit}>/{units}</span>
            </div>
          </>
        )}
      </div>
      {intensity && (intensity.hr || intensity.rpe != null || intensity.power) && (
        <div className={styles.intensityRow}>
          {intensity.hr && (
            <div className={styles.intensityCell}>
              <span className={styles.lbl}>HR</span>
              <span className={styles.val}>
                {"zone" in intensity.hr
                  ? intensity.hr.zone
                  : `${(intensity.hr as { min_bpm?: number }).min_bpm ?? ""}–${(intensity.hr as { max_bpm?: number }).max_bpm ?? ""}`}
              </span>
            </div>
          )}
          {intensity.rpe != null && (
            <div className={styles.intensityCell}>
              <span className={styles.lbl}>RPE</span>
              <span className={styles.val}>{intensity.rpe}/10</span>
            </div>
          )}
          {intensity.power && (
            <div className={styles.intensityCell}>
              <span className={styles.lbl}>Power</span>
              <span
                className={styles.val}
              >{`${intensity.power.min_watts ?? ""}–${intensity.power.max_watts ?? ""} W`}</span>
            </div>
          )}
        </div>
      )}
      {workout.notes && <p className={styles.description}>{workout.notes}</p>}
    </article>
  );
}
