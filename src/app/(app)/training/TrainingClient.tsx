"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkoutRow } from "@/plans/dateQueries";
import type { ActivityRow } from "@/strava/dateQueries";
import { WeekNavigator } from "@/components/workouts/WeekNavigator";
import { WeekAgendaRows } from "@/components/workouts/WeekAgendaRows";
import { WorkoutDetailSheet } from "@/components/workouts/WorkoutDetailSheet";
import { CoachLink } from "@/components/layout/CoachLink";
import styles from "./Calendar.module.scss";

interface Props {
  planTitle: string;
  monday: string;
  weekTitle: string;
  weekRange: string;
  prevHref: string | null;
  nextHref: string | null;
  todayHref: string;
  isCurrentWeek: boolean;
  workouts: WorkoutRow[];
  activities: ActivityRow[];
  today: string;
  units: "mi" | "km";
  activePlanId: string;
}

export function TrainingClient({ planTitle, monday, weekTitle, weekRange, prevHref, nextHref, todayHref, isCurrentWeek, workouts, activities, today, units, activePlanId }: Props) {
  const byDate = useMemo(() => new Map(workouts.map((w) => [w.date, w])), [workouts]);
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const act of activities) {
      const date = act.start_date.toISOString().slice(0, 10);
      const existing = map.get(date) ?? [];
      existing.push(act);
      map.set(date, existing);
    }
    return map;
  }, [activities]);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const openWorkout = openDate ? (byDate.get(openDate) ?? null) : null;

  const headerRef = useRef<HTMLElement>(null);
  const [navStickyTop, setNavStickyTop] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      const stickyOffset = parseFloat(window.getComputedStyle(el).top) || 0;
      setNavStickyTop(el.offsetHeight + stickyOffset);
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <header ref={headerRef} className={styles.pageHeader}>
        <div className={styles.pageTitles}>
          <h1 className={styles.pageTitle}>Training</h1>
          <p className={styles.pageSubtitle}>{planTitle}</p>
        </div>
        <CoachLink />
      </header>
      <WeekNavigator
        weekTitle={weekTitle}
        weekRange={weekRange}
        prev={prevHref ? { href: prevHref } : { disabled: true }}
        next={nextHref ? { href: nextHref } : { disabled: true }}
        today={{ href: todayHref }}
        showToday={!isCurrentWeek}
        stickyTop={navStickyTop}
      />
      <WeekAgendaRows
        monday={monday}
        byDate={byDate}
        activitiesByDate={activitiesByDate}
        today={today}
        units={units}
        isActivePlan={true}
        onDayClick={setOpenDate}
      />
      <WorkoutDetailSheet
        workout={openWorkout}
        planId={activePlanId}
        units={units}
        onClose={() => setOpenDate(null)}
      />
    </>
  );
}
