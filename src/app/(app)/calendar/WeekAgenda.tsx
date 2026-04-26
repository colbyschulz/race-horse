import { WorkoutBadge } from "@/components/workouts/WorkoutBadge";
import { addDays, formatDayLabel } from "@/lib/dates";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./Calendar.module.scss";

interface Props {
  monday: string;
  today: string;
  workouts: WorkoutRow[];
  units: "mi" | "km";
}

function fmtDist(m: string | null | undefined, units: "mi" | "km"): string {
  if (m == null) return "—";
  return (Number(m) / (units === "mi" ? 1609.344 : 1000)).toFixed(1);
}

function fmtDur(s: number | null | undefined): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

export function WeekAgenda({ monday, today, workouts, units }: Props) {
  const byDate = new Map(workouts.map((w) => [w.date, w]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const totalMeters = workouts.reduce((s, w) => s + Number(w.distance_meters ?? 0), 0);
  const totalSeconds = workouts.reduce((s, w) => s + (w.duration_seconds ?? 0), 0);

  return (
    <div className={styles.agenda}>
      {days.map((d) => {
        const w = byDate.get(d);
        const isToday = d === today;
        const isRest = !w || w.type === "rest";
        return (
          <div key={d} className={`${styles.dayRow} ${isToday ? styles.dayToday : ""}`}>
            <div className={styles.dayTop}>
              <span className={`${styles.dayLabel} ${isToday ? styles.dayLabelToday : ""}`}>
                {formatDayLabel(d)}
              </span>
              {isRest
                ? <span className={styles.restLabel}>Rest day</span>
                : <WorkoutBadge type={w!.type} size="sm" />}
              {isToday && <span className={styles.todayPill}>Today</span>}
            </div>
            {!isRest && w && (
              <div className={styles.statsRow}>
                <div className={styles.statNum}>
                  <span className={styles.statVal}>{fmtDist(w.distance_meters as string | null, units)}</span>
                  <span className={styles.statUnit}>{units}</span>
                </div>
                <div className={styles.statNum}>
                  <span className={styles.statVal}>{fmtDur(w.duration_seconds)}</span>
                  <span className={styles.statUnit}>time</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {workouts.length > 0 && (
        <div className={styles.weekTotal}>
          <span className={styles.totalLabel}>Week total</span>
          <span className={styles.totalValue}>
            {fmtDist(String(totalMeters), units)} {units} · {fmtDur(totalSeconds)}
          </span>
        </div>
      )}
    </div>
  );
}
