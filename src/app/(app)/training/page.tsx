import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getActivePlan, getWorkoutsForDateRange } from "@/plans/dateQueries";
import { getActivitiesForDateRange } from "@/strava/dateQueries";
import { addDays, mondayOf, todayIso } from "@/lib/dates";
import { TrainingClient } from "./TrainingClient";
import { NoActivePlan } from "@/components/plans/NoActivePlan";
import styles from "./Calendar.module.scss";

function fmtShortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function weekIndexFromStart(planStart: string, monday: string): number {
  const startMon = mondayOf(planStart);
  const ms = new Date(monday + "T00:00:00").getTime() - new Date(startMon + "T00:00:00").getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const today = todayIso();

  const { week } = await searchParams;
  const monday = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? mondayOf(week) : mondayOf(today);
  const sunday = addDays(monday, 6);

  const [pref] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";

  const activePlan = await getActivePlan(userId);
  const [workouts, activities] = await Promise.all([
    activePlan ? getWorkoutsForDateRange(userId, monday, sunday) : Promise.resolve([]),
    getActivitiesForDateRange(userId, monday, sunday),
  ]);
  const isCurrentWeek = monday === mondayOf(today);

  // Compute plan boundaries (only meaningful for goal plans with end_date)
  const planFirstMonday = activePlan ? mondayOf(activePlan.start_date) : null;
  // Use day-before end_date so a plan ending on a Monday (e.g. May 4) doesn't
  // produce a "Week 17" title for the week *starting* on that Monday.
  const planLastMonday = activePlan?.end_date ? mondayOf(addDays(activePlan.end_date, -1)) : null;
  const insidePlan = activePlan
    ? monday >= (planFirstMonday ?? monday) && (planLastMonday == null || monday <= planLastMonday)
    : false;
  const prevDisabled = !!planFirstMonday && monday <= planFirstMonday;

  const weekTitle = activePlan && insidePlan
    ? `Week ${weekIndexFromStart(activePlan.start_date, monday)}`
    : fmtShortDate(monday);
  const weekRange = `${fmtShortDate(monday)} – ${fmtShortDate(sunday)}`;

  return (
    <div className={styles.page}>
      {!activePlan && <NoActivePlan context="calendar" />}
      {activePlan && (
        <TrainingClient
          planTitle={activePlan.title}
          monday={monday}
          weekTitle={weekTitle}
          weekRange={weekRange}
          prevHref={prevDisabled ? null : `/training?week=${addDays(monday, -7)}`}
          nextHref={`/training?week=${addDays(monday, 7)}`}
          todayHref="/training"
          isCurrentWeek={isCurrentWeek}
          workouts={workouts}
          activities={activities}
          today={today}
          units={units}
          activePlanId={activePlan.id}
        />
      )}
    </div>
  );
}
