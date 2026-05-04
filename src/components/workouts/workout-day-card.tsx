"use client";
import type { CSSProperties } from "react";
import { formatDayLabel } from "@/lib/dates";
import { formatDistance, formatDuration } from "@/lib/format";
import { WorkoutBadge } from "./workout-badge";
import { SportIcon } from "./sport-icon";
import type { WorkoutRow } from "@/types/plans";
import type { Activity } from "@/types/strava";
import styles from "./workout-day-card.module.scss";

interface Props {
  date: string;
  workout: WorkoutRow | null;
  activities?: Activity[];
  units: "mi" | "km";
  isToday?: boolean;
  onClick?: () => void;
  showNotes?: boolean;
}

export function WorkoutDayCard({
  date,
  workout,
  activities = [],
  units,
  isToday = false,
  onClick,
  showNotes = false,
}: Props) {
  const isRest = !workout || workout.type === "rest";
  const clickable = !isRest && !!onClick;

  const dist = !isRest ? formatDistance(workout!.distance_meters as string | null, units) : null;
  const dur = !isRest ? formatDuration(workout!.duration_seconds) : null;
  const stat = dist ? `${dist} ${units}` : dur;
  const notes = showNotes && !isRest && workout?.notes ? workout.notes : null;

  // Secondary workout (doubles)
  const secondary = !isRest ? (workout!.secondary as import("@/server/db/schema").SecondaryWorkout | null | undefined) : null;
  const secDist = secondary?.distance_km != null
    ? formatDistance(String(secondary.distance_km * 1000), units)
    : null;
  const secDur = secondary?.duration_minutes != null
    ? formatDuration(secondary.duration_minutes * 60)
    : null;
  const secStat = secDist ? `${secDist} ${units}` : secDur;

  const railType = isRest ? "rest" : workout!.type;
  const cardStyle = { "--rail": `var(--color-workout-${railType}-mid)` } as CSSProperties;

  return (
    <div
      className={`${styles.card} ${isToday ? styles.cardToday : ""}`}
      style={cardStyle}
    >
      <button
        type="button"
        className={styles.dayBtn}
        disabled={!clickable}
        onClick={() => clickable && onClick!()}
        aria-label={isRest ? "Rest day" : `View workout for ${formatDayLabel(date)}`}
      />

      <div className={styles.body}>
        <div className={styles.topRow}>
          <div className={styles.left}>
            <span className={`${styles.dayLabel} ${isToday ? styles.dayLabelToday : ""}`}>
              {formatDayLabel(date)}
            </span>
            <WorkoutBadge type={isRest ? "rest" : workout!.type} size="sm" />
          </div>
          {!isRest && stat && (
            <div className={styles.statGroup}>
              <SportIcon type={workout!.sport} className={styles.sportIcon} />
              <span className={styles.statValue}>{stat}</span>
            </div>
          )}
        </div>

        {notes && (
          <div className={styles.details}>
            <p className={styles.notes}>{notes}</p>
          </div>
        )}

        {secondary && (
          <div className={styles.secondary}>
            <div className={styles.secondaryRow}>
              <WorkoutBadge type={secondary.type} size="sm" />
              {secStat && (
                <div className={styles.statGroup}>
                  <SportIcon type={workout!.sport} className={styles.sportIcon} />
                  <span className={styles.secStatValue}>{secStat}</span>
                </div>
              )}
            </div>
            {showNotes && secondary.notes && (
              <p className={styles.notes}>{secondary.notes}</p>
            )}
          </div>
        )}
      </div>

      {activities.length > 0 && (
        <div className={`${styles.completion} ${isToday ? styles.completionToday : ""}`}>
          {activities.map((act) => (
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
              <span className={styles.activityName}>{act.name}</span>
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
}
