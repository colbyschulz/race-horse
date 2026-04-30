"use client";

import { useMemo, use } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { CSRSuspense } from "@/lib/csr-suspense";
import type { PlanRow, WorkoutRow } from "@/types/plans";
import { addDays, mondayOf, todayIso, isIsoDate } from "@/lib/dates";
import { planNavBounds } from "@/lib/plan-nav";
import { groupActivitiesByDate } from "@/lib/group-activities";
import { useWorkoutSheet } from "@/lib/use-workout-sheet";
import { PlanView } from "@/components/plans/plan-view";
import { PlanStatusActions } from "@/components/plans/plan-status-actions";
import { WorkoutDetailSheet } from "@/components/workouts/workout-detail-sheet";
import { CoachLink } from "@/components/layout/coach-link";
import { WeekAgendaSkeleton } from "@/components/skeletons/week-agenda-skeleton";
import { usePreferences } from "@/queries/preferences";
import { usePlan, usePlanWorkouts } from "@/queries/plans";
import { useActivities } from "@/queries/activities";
import styles from "./plan-detail.module.scss";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PlanDetailPage({ params }: PageProps) {
  const { id } = use(params);
  return (
    <div className={styles.page}>
      <CSRSuspense fallback={<WeekAgendaSkeleton />}>
        <PlanDetailContent planId={id} />
      </CSRSuspense>
    </div>
  );
}

function PlanDetailContent({ planId }: { planId: string }) {
  const searchParams = useSearchParams();
  const week = searchParams.get("week");

  const { data: prefs } = usePreferences();
  const { data: plan } = usePlan(planId);
  const { data: allWorkouts } = usePlanWorkouts(planId);

  if (!plan) notFound();

  const today = todayIso(prefs.timezone);

  const { firstMonday: planFirstMonday, lastMonday: planLastMonday } = planNavBounds(
    plan.start_date,
    plan.end_date,
    mondayOf(today)
  );
  const defaultMonday =
    planLastMonday == null || mondayOf(today) <= planLastMonday
      ? mondayOf(today) >= planFirstMonday
        ? mondayOf(today)
        : planFirstMonday
      : planLastMonday;

  const monday = isIsoDate(week) ? mondayOf(week) : defaultMonday;
  const sunday = addDays(monday, 6);

  const { prevDisabled, nextDisabled } = planNavBounds(plan.start_date, plan.end_date, monday);
  const isCurrentWeek = monday === mondayOf(today);

  return (
    <PlanWeek
      plan={plan}
      allWorkouts={allWorkouts}
      monday={monday}
      sunday={sunday}
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
  sunday: string;
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
  sunday,
  prevHref,
  nextHref,
  todayHref,
  isCurrentWeek,
  today,
  units,
}: PlanWeekProps) {
  const { data: weekActivities } = useActivities(monday, sunday);
  const activitiesByDate = useMemo(
    () => groupActivitiesByDate(weekActivities),
    [weekActivities]
  );
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
          showToday: !isCurrentWeek,
          activitiesByDate,
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
