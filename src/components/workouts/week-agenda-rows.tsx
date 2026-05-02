"use client";
import { addDays } from "@/lib/dates";
import { formatDistance } from "@/lib/format";
import { WorkoutDayCard } from "./workout-day-card";
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
        const w = byDate.get(d) ?? null;
        const acts = activitiesByDate?.get(d) ?? [];
        const isToday = isActivePlan && d === today;
        const isRest = !w || w.type === "rest";
        return (
          <WorkoutDayCard
            key={d}
            date={d}
            workout={w}
            activities={acts}
            units={units}
            isToday={isToday}
            onClick={!isRest && onDayClick ? () => onDayClick(d) : undefined}
            showNotes={showNotes}
          />
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
