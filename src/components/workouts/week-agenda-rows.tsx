"use client";
import { useRef, useEffect } from "react";
import { addDays } from "@/lib/dates";
import { formatDistance } from "@/lib/format";
import { dayMeters } from "@/lib/plan-stats";
import { activitySport, type Sport } from "@/lib/activity-sport";
import { WorkoutDayCard } from "./workout-day-card";
import type { WorkoutRow } from "@/types/plans";
import type { Activity } from "@/types/strava";
import styles from "./week-agenda-rows.module.scss";

const SPORT_LABEL: Record<Sport, string> = { run: "Run", bike: "Ride" };

interface Props {
  monday: string;
  byDate: Map<string, WorkoutRow>;
  activitiesByDate?: Map<string, Activity[]>;
  today: string;
  units: "mi" | "km";
  /** The plan's sport, whose totals are listed first. */
  planSport: string;
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
  planSport,
  isActivePlan,
  onDayClick,
  showWeekTotal = true,
  showNotes = false,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Runs and rides are totalled apart, so one never inflates the other. A
  // Strava activity that is neither (a walk, a swim) counts toward nothing.
  const planned: Record<Sport, number> = { run: 0, bike: 0 };
  const completed: Record<Sport, number> = { run: 0, bike: 0 };
  for (const d of days) {
    const w = byDate.get(d);
    if (w) {
      planned.run += dayMeters(w, "run");
      planned.bike += dayMeters(w, "bike");
    }
    for (const act of activitiesByDate?.get(d) ?? []) {
      const sport = activitySport(act.type);
      if (sport) completed[sport] += act.distance_meters == null ? 0 : Number(act.distance_meters);
    }
  }
  const sports: Sport[] = planSport === "bike" ? ["bike", "run"] : ["run", "bike"];
  const shown = sports.filter((s) => planned[s] > 0 || completed[s] > 0);

  return (
    <div className={styles.agenda}>
      {days.map((d) => {
        const w = byDate.get(d) ?? null;
        const acts = activitiesByDate?.get(d) ?? [];
        const isToday = isActivePlan && d === today;
        const isRest = !w || w.type === "rest";
        return (
          <div key={d} ref={isToday ? todayRef : undefined}>
            <WorkoutDayCard
              date={d}
              workout={w}
              activities={acts}
              units={units}
              isToday={isToday}
              onClick={!isRest && onDayClick ? () => onDayClick(d) : undefined}
              showNotes={showNotes}
            />
          </div>
        );
      })}
      {showWeekTotal && (planned.run > 0 || planned.bike > 0) && (
        <div className={styles.weekTotal}>
          {shown.map((sport) => (
            <div key={sport} className={styles.sportTotal} data-sport={sport}>
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>{SPORT_LABEL[sport]} total</span>
                <span className={styles.totalValue}>
                  {planned[sport] > 0 ? `${formatDistance(planned[sport], units)} ${units}` : "—"}
                </span>
              </div>
              {completed[sport] > 0 && (
                <div className={styles.totalRow}>
                  <span className={styles.completedLabel}>
                    Completed {sport === "bike" ? "ride" : "run"}
                  </span>
                  <span className={styles.completedValue}>
                    {formatDistance(completed[sport], units) ?? "—"} {units}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
