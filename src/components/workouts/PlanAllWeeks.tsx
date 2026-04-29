"use client";
import { useMemo } from "react";
import type { WorkoutRow } from "@/plans/dateQueries";
import { mondayOf, addDays } from "@/lib/dates";
import { WeekNavigator } from "./WeekNavigator";
import { WeekAgendaRows } from "./WeekAgendaRows";
import styles from "./PlanAllWeeks.module.scss";

interface Props {
  allWorkouts: WorkoutRow[];
  units: "mi" | "km";
  today: string;
  planStartDate?: string;
}

function weekNum(planStartDate: string, monday: string): number {
  const startMon = mondayOf(planStartDate);
  const ms = new Date(monday + "T00:00:00").getTime() - new Date(startMon + "T00:00:00").getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function fmtRange(monday: string): string {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const fmt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", opts);
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export function PlanAllWeeks({ allWorkouts, units, today, planStartDate }: Props) {
  const weeks = useMemo(() => {
    if (allWorkouts.length === 0) return [];
    const set = new Set<string>();
    for (const w of allWorkouts) set.add(mondayOf(w.date));
    return Array.from(set).sort();
  }, [allWorkouts]);

  if (weeks.length === 0) return null;

  return (
    <div className={styles.weeks}>
      {weeks.map((monday) => {
        const byDate = new Map(
          allWorkouts.filter((w) => mondayOf(w.date) === monday).map((w) => [w.date, w])
        );
        const title = planStartDate ? `Week ${weekNum(planStartDate, monday)}` : "Week";
        return (
          <div key={monday}>
            <WeekNavigator
              weekTitle={title}
              weekRange={fmtRange(monday)}
              prev={{ disabled: true }}
              next={{ disabled: true }}
              showToday={false}
            />
            <WeekAgendaRows
              monday={monday}
              byDate={byDate}
              today={today}
              units={units}
              isActivePlan={false}
              showWeekTotal
            />
          </div>
        );
      })}
    </div>
  );
}
