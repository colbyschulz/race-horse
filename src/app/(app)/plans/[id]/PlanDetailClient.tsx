"use client";
import { useMemo, useState } from "react";
import type { WorkoutRow } from "@/plans/dateQueries";
import type { ActivityRow } from "@/strava/dateQueries";
import type { Goal } from "@/db/schema";
import { PlanView } from "@/components/plans/PlanView";
import { PlanStatusActions } from "@/components/plans/PlanStatusActions";
import { WorkoutDetailSheet } from "@/components/workouts/WorkoutDetailSheet";
import { CoachLink } from "@/components/layout/CoachLink";

interface PlanLike {
  id: string;
  title: string;
  sport: string;
  start_date: string;
  end_date: string | null;
  mode: string;
  goal: Goal | null;
  is_active: boolean;
}

interface Props {
  plan: PlanLike;
  monday: string;
  prevHref: string | null;
  nextHref: string | null;
  todayHref: string;
  isCurrentWeek: boolean;
  allWorkouts: WorkoutRow[];
  weekActivities: ActivityRow[];
  today: string;
  units: "mi" | "km";
}

export function PlanDetailClient({
  plan,
  monday,
  prevHref,
  nextHref,
  todayHref,
  isCurrentWeek,
  allWorkouts,
  weekActivities,
  today,
  units,
}: Props) {
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
  const openWorkout = openDate ? (allWorkouts.find((w) => w.date === openDate) ?? null) : null;

  return (
    <>
      <PlanView
        plan={plan}
        today={today}
        units={units}
        allWorkouts={allWorkouts}
        headerActions={<PlanStatusActions plan={plan} today={today} />}
        subheaderAction={<CoachLink />}
        currentWeek={{
          monday,
          prev: prevHref ? { href: prevHref } : { disabled: true },
          next: nextHref ? { href: nextHref } : { disabled: true },
          todayNav: { href: todayHref },
          showToday: !isCurrentWeek,
          activitiesByDate,
          isActivePlan: plan.is_active,
          onWorkoutClick: setOpenDate,
        }}
      />
      <WorkoutDetailSheet
        workout={openWorkout}
        planId={plan.id}
        units={units}
        onClose={() => setOpenDate(null)}
      />
    </>
  );
}
