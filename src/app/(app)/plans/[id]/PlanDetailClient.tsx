"use client";
import { useMemo, useState } from "react";
import type { WorkoutRow } from "@/plans/dateQueries";
import type { ActivityRow } from "@/strava/dateQueries";
import { PlanHeader } from "./PlanHeader";
import { PlanStats } from "./PlanStats";
import { MileageChart } from "./MileageChart";
import { WeekNavigator } from "@/components/workouts/WeekNavigator";
import { WeekAgendaRows } from "@/components/workouts/WeekAgendaRows";
import { WorkoutDetailSheet } from "@/components/workouts/WorkoutDetailSheet";
import styles from "./PlanDetail.module.scss";

interface PlanLike {
  id: string;
  title: string;
  sport: string;
  start_date: string;
  end_date: string | null;
  mode: string;
  is_active: boolean;
}

interface Props {
  plan: PlanLike;
  monday: string;
  weekTitle: string;
  weekRange: string;
  prevHref: string | null;
  nextHref: string | null;
  todayHref: string;
  isCurrentWeek: boolean;
  allWorkouts: WorkoutRow[];
  weekWorkouts: WorkoutRow[];
  weekActivities: ActivityRow[];
  today: string;
  units: "mi" | "km";
}

export function PlanDetailClient({
  plan,
  monday,
  weekTitle,
  weekRange,
  prevHref,
  nextHref,
  todayHref,
  isCurrentWeek,
  allWorkouts,
  weekWorkouts,
  weekActivities,
  today,
  units,
}: Props) {
  const byDate = useMemo(() => new Map(weekWorkouts.map((w) => [w.date, w])), [weekWorkouts]);
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const act of weekActivities) {
      const date = act.start_date.toISOString().slice(0, 10);
      const existing = map.get(date) ?? [];
      existing.push(act);
      map.set(date, existing);
    }
    return map;
  }, [weekActivities]);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const openWorkout = openDate ? (byDate.get(openDate) ?? null) : null;

  return (
    <>
      <div className={styles.topSection}>
        <PlanHeader plan={plan} today={today} />
        <PlanStats workouts={allWorkouts} units={units} planStartDate={plan.start_date} planEndDate={plan.end_date} />
        <MileageChart workouts={allWorkouts} units={units} />
      </div>
      <div className={styles.scrollSection}>
        <WeekNavigator
          weekTitle={weekTitle}
          weekRange={weekRange}
          prev={prevHref ? { href: prevHref } : { disabled: true }}
          next={nextHref ? { href: nextHref } : { disabled: true }}
          today={{ href: todayHref }}
          showToday={!isCurrentWeek}
        />
        <WeekAgendaRows
          monday={monday}
          byDate={byDate}
          activitiesByDate={activitiesByDate}
          today={today}
          units={units}
          isActivePlan={plan.is_active}
          onDayClick={setOpenDate}
        />
      </div>
      <WorkoutDetailSheet
        workout={openWorkout}
        planId={plan.id}
        units={units}
        onClose={() => setOpenDate(null)}
      />
    </>
  );
}
