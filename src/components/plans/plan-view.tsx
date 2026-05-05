"use client";
import { useMemo, useState } from "react";
import type { WorkoutRow } from "@/types/plans";
import type { Activity } from "@/types/strava";
import { mondayOf, addDays, formatDateShort, weekIndexFromStart } from "@/lib/dates";
import { PlanHeading } from "./plan-heading";
import { PlanMeta, type GoalLike } from "./plan-meta";
import { PlanArc } from "./plan-arc";
import { PlanStats } from "@/app/(app)/plans/[id]/plan-stats";
import { MileageChart } from "@/app/(app)/plans/[id]/mileage-chart";
import { WeekNavigator, type NavTarget } from "@/components/workouts/week-navigator";
import { WeekAgendaRows } from "@/components/workouts/week-agenda-rows";
import styles from "./plan-view.module.scss";

interface PlanLike {
  title: string;
  sport: string;
  start_date: string;
  end_date: string | null;
  mode: string;
  goal: GoalLike | null;
  coach_notes?: string;
}

export interface CurrentWeek {
  monday: string;
  prev: NavTarget;
  next: NavTarget;
  todayNav?: NavTarget;
  showToday?: boolean;
  activitiesByDate?: Map<string, Activity[]>;
  isActivePlan: boolean;
  onWorkoutClick?: (date: string) => void;
}

interface Props {
  plan: PlanLike;
  today: string;
  units: "mi" | "km";
  allWorkouts: WorkoutRow[];
  headerActions?: React.ReactNode;
  actionsBar?: React.ReactNode;
  subheaderAction?: React.ReactNode;
  banner?: React.ReactNode;
  currentWeek?: CurrentWeek;
}

export function PlanView({
  plan,
  today,
  units,
  allWorkouts,
  headerActions,
  actionsBar,
  subheaderAction,
  banner,
  currentWeek,
}: Props) {
  const [metaOverride, setMetaOverride] = useState<boolean | null>(null);
  const metaOpen = metaOverride ?? true;

  const weekData = useMemo(() => {
    if (!currentWeek) return null;
    const sunday = addDays(currentWeek.monday, 6);
    const byDate = new Map<string, WorkoutRow>(
      allWorkouts
        .filter((w) => w.date >= currentWeek.monday && w.date <= sunday)
        .map((w) => [w.date, w])
    );
    const planFirstMonday = mondayOf(plan.start_date);
    const planLastMonday = plan.end_date ? mondayOf(addDays(plan.end_date, -1)) : null;
    const insidePlan =
      currentWeek.monday >= planFirstMonday &&
      (planLastMonday == null || currentWeek.monday <= planLastMonday);
    const weekIndex = weekIndexFromStart(plan.start_date, currentWeek.monday);
    return {
      byDate,
      weekTitle: insidePlan ? `Week ${weekIndex}` : formatDateShort(currentWeek.monday),
      weekRange: `${formatDateShort(currentWeek.monday)} – ${formatDateShort(sunday)}`,
    };
  }, [currentWeek, allWorkouts, plan.start_date, plan.end_date]);

  return (
    <>
      <div className={styles.topSection}>
        <PlanHeading title={plan.title} actions={headerActions} subRow={actionsBar} />
        <div className={styles.segmentRow}>
          <div className={styles.viewSegment}>
          <button
            type="button"
            className={metaOpen ? styles.viewSegmentBtnActive : styles.viewSegmentBtn}
            onClick={() => setMetaOverride(true)}
          >
            Details
          </button>
          <button
            type="button"
            className={!metaOpen ? styles.viewSegmentBtnActive : styles.viewSegmentBtn}
            onClick={() => setMetaOverride(false)}
          >
            Calendar
          </button>
        </div>
          {subheaderAction && <div className={styles.segmentRowAction}>{subheaderAction}</div>}
        </div>
      </div>

      <div className={styles.scrollSection}>
        {banner}
        {metaOpen && (
          <>
            <PlanMeta
              startDate={plan.start_date}
              endDate={plan.end_date}
              mode={plan.mode}
              goal={plan.goal}
            />
            <PlanStats
              workouts={allWorkouts}
              units={units}
              planStartDate={plan.start_date}
              planEndDate={plan.end_date}
              today={today}
            />
            <MileageChart workouts={allWorkouts} units={units} planStartDate={plan.start_date} />
            {plan.coach_notes && <PlanArc notes={plan.coach_notes} />}
          </>
        )}
        {currentWeek && weekData && !metaOpen && (
          <>
            <WeekNavigator
              weekTitle={weekData.weekTitle}
              weekRange={weekData.weekRange}
              prev={currentWeek.prev}
              next={currentWeek.next}
              today={currentWeek.todayNav}
              showToday={currentWeek.showToday}
            />
            <WeekAgendaRows
              monday={currentWeek.monday}
              byDate={weekData.byDate}
              activitiesByDate={currentWeek.activitiesByDate}
              today={today}
              units={units}
              isActivePlan={currentWeek.isActivePlan}
              onDayClick={currentWeek.onWorkoutClick}
              showNotes
            />
          </>
        )}
      </div>
    </>
  );
}
