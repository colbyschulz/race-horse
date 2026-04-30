"use client";
import { addDays, formatDayLabel } from "@/lib/dates";
import { formatDistance, formatDuration } from "@/lib/format";
import { WorkoutBadge } from "./workout-badge";
import type { WorkoutRow } from "@/types/plans";
import type { Activity } from "@/types/strava";
import styles from "./week-agenda-rows.module.scss";

interface Props {
  monday: string;
  byDate: Map<string, WorkoutRow>;
  activitiesByDate?: Map<string, Activity[]>;
  today: string;
  units: "mi" | "km";
  isActivePlan: boolean;
  onDayClick?: (date: string) => void;
  showWeekTotal?: boolean;
}

export function WeekAgendaRows({
  monday,
  byDate,
  activitiesByDate,
  today,
  units,
  isActivePlan,
  onDayClick,
  showWeekTotal = true,
}: Props) {
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
              className={styles.dayBtn}
              disabled={!clickable}
              onClick={() => clickable && onDayClick!(d)}
              aria-label={isRest ? "Rest day" : `View workout for ${formatDayLabel(d)}`}
            />
            <div className={styles.dayContent}>
              <div className={styles.workoutLine}>
                <span className={`${styles.dayLabel} ${isToday ? styles.dayLabelToday : ""}`}>
                  {formatDayLabel(d)}
                </span>
                <WorkoutBadge type={isRest ? "rest" : w!.type} size="sm" />
                {!isRest && w && (
                  <span className={styles.meta}>
                    <span className={styles.metaVal}>
                      {formatDistance(w.distance_meters as string | null, units) ?? "—"}
                    </span>
                    <span className={styles.metaUnit}>{units}</span>
                    <span className={styles.metaSep}>·</span>
                    <span className={styles.metaVal}>
                      {formatDuration(w.duration_seconds) ?? "—"}
                    </span>
                  </span>
                )}
              </div>
              {acts.map((act) => (
                <div key={act.id} className={styles.activityLine}>
                  <a
                    className={styles.stravaLink}
                    href={`https://www.strava.com/activities/${act.strava_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View on Strava"
                  >
                    <svg className={styles.stravaIcon} viewBox="0 0 24 24" role="img">
                      <path
                        fill="#FC4C02"
                        d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"
                      />
                    </svg>
                    <span className={styles.activityMeta}>
                      {formatDistance(act.distance_meters, units) ?? "—"} {units}
                      {act.moving_time_seconds
                        ? ` · ${formatDuration(act.moving_time_seconds) ?? ""}`
                        : ""}
                    </span>
                    <svg
                      className={styles.externalArrow}
                      viewBox="0 0 16 16"
                      aria-hidden
                      role="img"
                    >
                      <path
                        d="M3 8 H13 M9 4 L13 8 L9 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {showWeekTotal && totalMeters > 0 && (
        <div className={styles.weekTotal}>
          <span className={styles.totalLabel}>Week total</span>
          <span className={styles.totalValue}>
            {formatDistance(totalMeters, units) ?? "—"} {units} ·{" "}
            {formatDuration(totalSeconds) ?? "—"}
          </span>
        </div>
      )}
    </div>
  );
}
