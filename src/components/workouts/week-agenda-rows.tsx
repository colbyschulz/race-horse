"use client";
import type { CSSProperties } from "react";
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
  showNotes?: boolean;
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
  showNotes = false,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  let totalMeters = 0;
  let completedMeters = 0;
  for (const d of days) {
    const w = byDate.get(d);
    if (w) totalMeters += w.distance_meters == null ? 0 : Number(w.distance_meters);
    for (const act of activitiesByDate?.get(d) ?? [])
      completedMeters += act.distance_meters == null ? 0 : Number(act.distance_meters);
  }

  return (
    <div className={styles.agenda}>
      {days.map((d) => {
        const w = byDate.get(d);
        const acts = activitiesByDate?.get(d) ?? [];
        const isToday = isActivePlan && d === today;
        const isRest = !w || w.type === "rest";
        const clickable = !!w && !isRest && !!onDayClick;

        const dist = !isRest && w ? formatDistance(w.distance_meters as string | null, units) : null;
        const dur = !isRest && w ? formatDuration(w.duration_seconds) : null;
        const notes = showNotes && !isRest && w?.notes ? w.notes : null;
        const railType = isRest ? "rest" : w!.type;
        const cardStyle = { "--rail": `var(--color-workout-${railType}-mid)` } as CSSProperties;

        return (
          <div
            key={d}
            className={`${styles.card} ${isToday ? styles.cardToday : ""}`}
            style={cardStyle}
          >
            <button
              type="button"
              className={styles.dayBtn}
              disabled={!clickable}
              onClick={() => clickable && onDayClick!(d)}
              aria-label={isRest ? "Rest day" : `View workout for ${formatDayLabel(d)}`}
            />

            <div className={styles.body}>
              <div className={styles.topRow}>
                <div className={styles.left}>
                  <span className={`${styles.dayLabel} ${isToday ? styles.dayLabelToday : ""}`}>
                    {formatDayLabel(d)}
                  </span>
                  <WorkoutBadge type={isRest ? "rest" : w!.type} size="sm" />
                </div>
                {!isRest && (dist || dur) && (
                  <div className={styles.right}>
                    <span className={styles.statValue}>{dist ? `${dist} ${units}` : dur}</span>
                  </div>
                )}
              </div>

              {notes && (
                <div className={styles.details}>
                  <p className={styles.notes}>{notes}</p>
                </div>
              )}
            </div>

            {acts.length > 0 && (
              <div className={`${styles.completion} ${isToday ? styles.completionToday : ""}`}>
                {acts.map((act) => (
                  <a
                    key={act.id}
                    className={styles.activityRow}
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
                    <span className={styles.activityName}>{act.name ?? "Activity"}</span>
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
                ))}
              </div>
            )}
          </div>
        );
      })}
      {showWeekTotal && totalMeters > 0 && (
        <div className={styles.weekTotal}>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Week total</span>
            <span className={styles.totalValue}>
              {formatDistance(totalMeters, units) ?? "—"} {units}
            </span>
          </div>
          {completedMeters > 0 && (
            <div className={styles.totalRow}>
              <span className={styles.completedLabel}>Completed</span>
              <span className={styles.completedValue}>
                {formatDistance(completedMeters, units) ?? "—"} {units}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
