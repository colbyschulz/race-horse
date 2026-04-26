import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getActivePlan, getWorkoutsForDateRange } from "@/plans/dateQueries";
import { addDays, formatWeekLabel, mondayOf, todayIso } from "@/lib/dates";
import { WeekAgenda } from "./WeekAgenda";
import { CalendarClient } from "./CalendarClient";
import { NoActivePlan } from "@/components/plans/NoActivePlan";
import styles from "./Calendar.module.scss";

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
  const workouts = activePlan ? await getWorkoutsForDateRange(userId, monday, sunday) : [];

  return (
    <div className={styles.page}>
      <CalendarClient
        weekLabel={formatWeekLabel(monday)}
        prevHref={`/calendar?week=${addDays(monday, -7)}`}
        nextHref={`/calendar?week=${addDays(monday, 7)}`}
        todayHref="/calendar"
        isCurrentWeek={monday === mondayOf(today)}
      />
      {!activePlan && <NoActivePlan context="calendar" />}
      {activePlan && (
        <WeekAgenda monday={monday} workouts={workouts} today={today} units={units} />
      )}
    </div>
  );
}
