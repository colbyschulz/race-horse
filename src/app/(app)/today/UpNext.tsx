import { WorkoutBadge } from "@/components/workouts/WorkoutBadge";
import { formatDayLabel } from "@/lib/dates";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./Today.module.scss";

function fmtDist(meters: string | null | undefined, units: "mi" | "km"): string | null {
  if (meters == null) return null;
  const val = Number(meters) / (units === "mi" ? 1609.344 : 1000);
  return `${val.toFixed(1)} ${units}`;
}

function fmtDur(s: number | null | undefined): string | null {
  if (s == null) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function UpNext({ workouts, units }: { workouts: WorkoutRow[]; units: "mi" | "km" }) {
  return (
    <section className={styles.upNextSection}>
      <h2 className={styles.h2}>Up next</h2>
      <ul className={styles.upNextList}>
        {workouts.map((w) => {
          const dist = fmtDist(w.distance_meters as string | null, units);
          const dur = fmtDur(w.duration_seconds);
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
