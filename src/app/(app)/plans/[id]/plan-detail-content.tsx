"use client";

import { notFound, useSearchParams } from "next/navigation";
import type { PlanRow, WorkoutRow } from "@/types/plans";
import { addDays, mondayOf, todayIso, isIsoDate } from "@/lib/dates";
import { planNavBounds } from "@/lib/plan-nav";
import { useWorkoutSheet } from "@/lib/use-workout-sheet";
import { PlanView } from "@/components/plans/plan-view";
import { PlanStatusActions } from "@/components/plans/plan-status-actions";
import { WorkoutDetailSheet } from "@/components/workouts/workout-detail-sheet";
import { CoachLink } from "@/components/layout/coach-link";
import { usePreferences } from "@/queries/preferences";
import { usePlan, usePlanWorkouts } from "@/queries/plans";

interface PlanDetailContentProps {
  planId: string;
}

export function PlanDetailContent({ planId }: PlanDetailContentProps) {
  const searchParams = useSearchParams();
  const week = searchParams.get("week");

  const { data: prefs } = usePreferences();
  const { data: plan } = usePlan(planId);
  const { data: allWorkouts } = usePlanWorkouts(planId);

  if (!plan) notFound();

  const today = todayIso(prefs.timezone);

  // For inactive (archived) plans cap navigation at the last workout's week.
  // Without this, indefinite plans (no end_date) default to today and allow
  // navigating into future empty weeks.
  const lastWorkoutDate =
    !plan.is_active && allWorkouts.length > 0
      ? allWorkouts.reduce((max, w) => (w.date > max ? w.date : max), allWorkouts[0].date)
      : null;
  const effectiveEndDate = !plan.is_active ? (lastWorkoutDate ?? plan.end_date) : plan.end_date;

  const { firstMonday: planFirstMonday, lastMonday: planLastMonday } = planNavBounds(
    plan.start_date,
    effectiveEndDate,
    mondayOf(today)
  );
  const defaultMonday =
    planLastMonday == null || mondayOf(today) <= planLastMonday
      ? mondayOf(today) >= planFirstMonday
        ? mondayOf(today)
        : planFirstMonday
      : planLastMonday;

  const monday = isIsoDate(week) ? mondayOf(week) : defaultMonday;

  const { prevDisabled, nextDisabled } = planNavBounds(plan.start_date, effectiveEndDate, monday);
  const isCurrentWeek = monday === mondayOf(today);

  return (
    <PlanWeek
      plan={plan}
      allWorkouts={allWorkouts}
      monday={monday}
      prevHref={prevDisabled ? null : `/plans/${planId}?week=${addDays(monday, -7)}`}
      nextHref={nextDisabled ? null : `/plans/${planId}?week=${addDays(monday, 7)}`}
      todayHref={`/plans/${planId}`}
      isCurrentWeek={isCurrentWeek}
      today={today}
      units={prefs.units}
    />
  );
}

interface PlanWeekProps {
  plan: PlanRow;
  allWorkouts: WorkoutRow[];
  monday: string;
  prevHref: string | null;
  nextHref: string | null;
  todayHref: string;
  isCurrentWeek: boolean;
  today: string;
  units: "mi" | "km";
}

function PlanWeek({
  plan,
  allWorkouts,
  monday,
  prevHref,
  nextHref,
  todayHref,
  isCurrentWeek,
  today,
  units,
}: PlanWeekProps) {
  const sheet = useWorkoutSheet((date) => allWorkouts.find((w) => w.date === date));

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
          showToday: !isCurrentWeek && plan.is_active,
          isActivePlan: plan.is_active,
          onWorkoutClick: sheet.open,
        }}
      />
      <WorkoutDetailSheet
        workout={sheet.openWorkout}
        planId={plan.id}
        units={units}
        onClose={sheet.close}
      />
    </>
  );
}
