"use client";
import { useEffect, useMemo, useState } from "react";
import type { WorkoutRow } from "@/plans/dateQueries";
import type { ActivityRow } from "@/strava/dateQueries";
import { mondayOf, addDays } from "@/lib/dates";
import { PlanHeading } from "./PlanHeading";
import { PlanMeta, type GoalLike } from "./PlanMeta";
import { PlanStats } from "@/app/(app)/plans/[id]/PlanStats";
import { MileageChart } from "@/app/(app)/plans/[id]/MileageChart";
import { WeekNavigator, type NavTarget } from "@/components/workouts/WeekNavigator";
import { WeekAgendaRows } from "@/components/workouts/WeekAgendaRows";
import styles from "./PlanView.module.scss";

interface PlanLike {
  title: string;
  sport: string;
  start_date: string;
  end_date: string | null;
  mode: string;
  goal: GoalLike | null;
}

export interface CurrentWeek {
  monday: string;
  prev: NavTarget;
  next: NavTarget;
  todayNav?: NavTarget;
  showToday?: boolean;
  activitiesByDate?: Map<string, ActivityRow[]>;
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

function fmtShortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function weekIndexFromStart(planStart: string, monday: string): number {
  const startMon = mondayOf(planStart);
  const ms = new Date(monday + "T00:00:00").getTime() - new Date(startMon + "T00:00:00").getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
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
  const [metaOpen, setMetaOpen] = useState(false);
  useEffect(() => {
    setMetaOpen(window.innerWidth >= 768);
  }, []);


  const weekData = useMemo(() => {
    if (!currentWeek) return null;
    const sunday = addDays(currentWeek.monday, 6);
    const byDate = new Map<string, WorkoutRow>(
      allWorkouts
        .filter((w) => w.date >= currentWeek.monday && w.date <= sunday)
        .map((w) => [w.date, w]),
    );
    const planFirstMonday = mondayOf(plan.start_date);
    const planLastMonday = plan.end_date ? mondayOf(addDays(plan.end_date, -1)) : null;
    const insidePlan =
      currentWeek.monday >= planFirstMonday &&
      (planLastMonday == null || currentWeek.monday <= planLastMonday);
    const weekIndex = weekIndexFromStart(plan.start_date, currentWeek.monday);
    return {
      byDate,
      weekTitle: insidePlan ? `Week ${weekIndex}` : fmtShortDate(currentWeek.monday),
      weekRange: `${fmtShortDate(currentWeek.monday)} – ${fmtShortDate(sunday)}`,
    };
  }, [currentWeek, allWorkouts, plan.start_date, plan.end_date]);

  return (
    <>
      <div className={styles.topSection}>
        <PlanHeading title={plan.title} actions={headerActions} subRow={actionsBar} />
        {subheaderAction && <div className={styles.subheaderAction}>{subheaderAction}</div>}
        <button
          type="button"
          className={styles.detailsToggle}
          onClick={() => setMetaOpen((v) => !v)}
        >
          Plan details
          <span className={`${styles.chevron} ${metaOpen ? styles.chevronUp : ""}`}>▾</span>
        </button>
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
            />
            <MileageChart workouts={allWorkouts} units={units} />
          </>
        )}
        {currentWeek && weekData && (
          <WeekNavigator
            weekTitle={weekData.weekTitle}
            weekRange={weekData.weekRange}
            prev={currentWeek.prev}
            next={currentWeek.next}
            today={currentWeek.todayNav}
            showToday={currentWeek.showToday}
          />
        )}
      </div>

      {banner && <div className={styles.banner}>{banner}</div>}

      {currentWeek && weekData && (
        <div className={styles.scrollSection}>
          <WeekAgendaRows
            monday={currentWeek.monday}
            byDate={weekData.byDate}
            activitiesByDate={currentWeek.activitiesByDate}
            today={today}
            units={units}
            isActivePlan={currentWeek.isActivePlan}
            onDayClick={currentWeek.onWorkoutClick}
          />
        </div>
      )}

    </>
  );
}
