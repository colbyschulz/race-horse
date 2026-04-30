"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CSRSuspense } from "@/lib/csr-suspense";
import {
  addDays,
  mondayOf,
  todayIso,
  formatDateShort,
  weekIndexFromStart,
  isIsoDate,
} from "@/lib/dates";
import { planNavBounds } from "@/lib/plan-nav";
import { groupActivitiesByDate } from "@/lib/group-activities";
import { useWorkoutSheet } from "@/lib/use-workout-sheet";
import { WeekNavigator } from "@/components/workouts/week-navigator";
import { WeekAgendaRows } from "@/components/workouts/week-agenda-rows";
import { WorkoutDetailSheet } from "@/components/workouts/workout-detail-sheet";
import { CoachLink } from "@/components/layout/coach-link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state/empty-state";
import { WeekAgendaSkeleton } from "@/components/skeletons/week-agenda-skeleton";
import { usePreferences } from "@/queries/preferences";
import { useActivePlan } from "@/queries/plans";
import { useWorkouts } from "@/queries/workouts";
import { useActivities } from "@/queries/activities";
import styles from "./training.module.scss";

export default function TrainingPage() {
  return (
    <div className={styles.page}>
      <CSRSuspense fallback={<WeekAgendaSkeleton />}>
        <TrainingContent />
      </CSRSuspense>
    </div>
  );
}

function TrainingContent() {
  const searchParams = useSearchParams();
  const week = searchParams.get("week");

  const { data: prefs } = usePreferences();
  const { data: activePlan } = useActivePlan();

  const today = todayIso(prefs.timezone);
  const monday = isIsoDate(week) ? mondayOf(week) : mondayOf(today);
  const sunday = addDays(monday, 6);

  if (!activePlan) {
    return (
      <EmptyState
        title="No active plan"
        body="Your weekly schedule will show up here once you activate a plan."
        variant="tinted"
        size="sm"
        action={{ label: "Go to Plans →", href: "/plans" }}
      />
    );
  }

  const isCurrentWeek = monday === mondayOf(today);
  const { prevDisabled, insidePlan } = planNavBounds(
    activePlan.start_date,
    activePlan.end_date,
    monday
  );
  const weekTitle = insidePlan
    ? `Week ${weekIndexFromStart(activePlan.start_date, monday)}`
    : formatDateShort(monday);
  const weekRange = `${formatDateShort(monday)} – ${formatDateShort(sunday)}`;

  return (
    <>
      <PageHeader
        title="Training"
        subtitle={activePlan.title}
        actions={<CoachLink planId={activePlan.id} />}
      />
      <WeekNavigator
        weekTitle={weekTitle}
        weekRange={weekRange}
        prev={prevDisabled ? { disabled: true } : { href: `/training?week=${addDays(monday, -7)}` }}
        next={{ href: `/training?week=${addDays(monday, 7)}` }}
        today={{ href: "/training" }}
        showToday={!isCurrentWeek}
      />
      <Suspense fallback={<WeekAgendaSkeleton />}>
        <WeekAgenda
          monday={monday}
          sunday={sunday}
          today={today}
          units={prefs.units}
          planId={activePlan.id}
        />
      </Suspense>
    </>
  );
}

interface WeekAgendaProps {
  monday: string;
  sunday: string;
  today: string;
  units: "mi" | "km";
  planId: string;
}

function WeekAgenda({ monday, sunday, today, units, planId }: WeekAgendaProps) {
  const { data: workouts } = useWorkouts(monday, sunday);
  const { data: activities } = useActivities(monday, sunday);

  const byDate = useMemo(() => new Map(workouts.map((w) => [w.date, w])), [workouts]);
  const activitiesByDate = useMemo(() => groupActivitiesByDate(activities), [activities]);
  const sheet = useWorkoutSheet((date) => byDate.get(date));

  return (
    <>
      <WeekAgendaRows
        monday={monday}
        byDate={byDate}
        activitiesByDate={activitiesByDate}
        today={today}
        units={units}
        isActivePlan={true}
        onDayClick={sheet.open}
      />
      <WorkoutDetailSheet
        workout={sheet.openWorkout}
        planId={planId}
        units={units}
        onClose={sheet.close}
      />
    </>
  );
}
