"use client";
import { addDays, formatDayLabel } from "@/lib/dates";
import { WorkoutBadge } from "./WorkoutBadge";
import type { WorkoutRow } from "@/plans/dateQueries";
import type { ActivityRow } from "@/strava/dateQueries";
import styles from "./WeekAgendaRows.module.scss";

function fmtDist(m: string | number | null | undefined, units: "mi" | "km"): string {
  if (m == null) return "—";
  return (Number(m) / (units === "mi" ? 1609.344 : 1000)).toFixed(1);
}

function fmtDur(s: number | null | undefined): string {
  if (s == null || s <= 0) return "—";
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

interface Props {
  monday: string;
  byDate: Map<string, WorkoutRow>;
  activitiesByDate?: Map<string, ActivityRow[]>;
  today: string;
  units: "mi" | "km";
  isActivePlan: boolean;
  onDayClick?: (date: string) => void;
  showWeekTotal?: boolean;
}

export function WeekAgendaRows({ monday, byDate, activitiesByDate, today, units, isActivePlan, onDayClick, showWeekTotal = true }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  let totalMeters = 0;
  let totalSeconds = 0;
  for (const d of days) {
    const w = byDate.get(d);
    if (w) {
      totalMeters += w.distance_meters == null ? 0 : Number(w.distance_meters);
      totalSeconds += w.duration_seconds ?? 0;
    }
  }

  return (
    <div className={styles.agenda}>
      {days.map((d) => {
        const w = byDate.get(d);
        const acts = activitiesByDate?.get(d) ?? [];
        const isToday = isActivePlan && d === today;
        const isRest = !w || w.type === "rest";
        const clickable = !!w && !isRest && !!onDayClick;
        return (
          <div key={d} className={`${styles.row} ${isToday ? styles.rowToday : ""}`}>
            <button
              type="button"
              className={styles.btn}
              disabled={!clickable}
              onClick={() => clickable && onDayClick!(d)}
            >
              <span className={`${styles.dayLabel} ${isToday ? styles.dayLabelToday : ""}`}>
                {formatDayLabel(d)}
              </span>
              {isRest
                ? <span className={styles.rest}>Rest</span>
                : <WorkoutBadge type={w!.type} size="sm" />
              }
              {isToday && <span className={styles.now}>Today</span>}
              {!isRest && w && (
                <span className={styles.meta}>
                  <span className={styles.metaVal}>{fmtDist(w.distance_meters as string | null, units)}</span>
                  <span className={styles.metaUnit}>{units}</span>
                  <span className={styles.metaSep}>·</span>
                  <span className={styles.metaVal}>{fmtDur(w.duration_seconds)}</span>
                </span>
              )}
            </button>
            {acts.map((act) => (
              <a
                key={act.id}
                className={styles.activityRow}
                href={`https://www.strava.com/activities/${act.strava_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className={styles.activityLabel}>Completed</span>
                <span className={styles.activityName}>{act.name}</span>
                <span className={styles.activityMeta}>
                  {fmtDist(act.distance_meters, units)}{" "}{units}
                  {act.moving_time_seconds ? ` · ${fmtDur(act.moving_time_seconds)}` : ""}
                </span>
              </a>
            ))}
          </div>
        );
      })}
      {showWeekTotal && totalMeters > 0 && (
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
