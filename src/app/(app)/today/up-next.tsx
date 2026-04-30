import { WorkoutBadge } from "@/components/workouts/workout-badge";
import { formatDayLabel } from "@/lib/dates";
import { formatDistance, formatDuration } from "@/lib/format";
import type { WorkoutRow } from "@/plans/date-queries";
import styles from "./today.module.scss";

export function UpNext({ workouts, units }: { workouts: WorkoutRow[]; units: "mi" | "km" }) {
  return (
    <section className={styles.upNextSection}>
      <h2 className={styles.h2}>Up next</h2>
      <ul className={styles.upNextList}>
        {workouts.map((w) => {
          const dist = formatDistance(w.distance_meters as string | null, units, {
            withUnit: true,
          });
          const dur = formatDuration(w.duration_seconds);
          return (
            <li key={w.id} className={styles.upNextRow}>
              <span className={styles.upNextDay}>{formatDayLabel(w.date)}</span>
              <div className={styles.upNextMain}>
                <WorkoutBadge type={w.type} size="sm" />
                {(dist || dur) && (
                  <span className={styles.upNextStats}>
                    {[dist, dur].filter(Boolean).join(" · ")}
                  </span>
                )}
                {w.notes && <span className={styles.upNextNotes}>{w.notes}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
