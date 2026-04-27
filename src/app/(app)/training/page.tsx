import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getActivePlan } from "@/plans/dateQueries";
import { addDays, mondayOf, todayIso } from "@/lib/dates";
import { WeekAgendaSection } from "./WeekAgendaSection";
import { WeekAgendaSkeleton } from "./WeekAgendaSkeleton";
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

  const [[pref], activePlan] = await Promise.all([
    db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1),
    getActivePlan(userId),
  ]);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";

  if (!activePlan) {
    return (
      <div className={styles.page}>
        <NoActivePlan context="calendar" />
      </div>
    );
  }

  const isCurrentWeek = monday === mondayOf(today);
  const planFirstMonday = mondayOf(activePlan.start_date);
  const planLastMonday = activePlan.end_date ? mondayOf(addDays(activePlan.end_date, -1)) : null;
  const insidePlan =
    monday >= planFirstMonday && (planLastMonday == null || monday <= planLastMonday);
  const prevDisabled = monday <= planFirstMonday;

  const weekTitle =
    insidePlan
      ? `Week ${weekIndexFromStart(activePlan.start_date, monday)}`
      : fmtShortDate(monday);
  const weekRange = `${fmtShortDate(monday)} – ${fmtShortDate(sunday)}`;

  return (
    <div className={styles.page}>
      <Suspense fallback={<WeekAgendaSkeleton />}>
        <WeekAgendaSection
          userId={userId}
          planId={activePlan.id}
          planTitle={activePlan.title}
          monday={monday}
          sunday={sunday}
          weekTitle={weekTitle}
          weekRange={weekRange}
          prevHref={prevDisabled ? null : `/training?week=${addDays(monday, -7)}`}
          nextHref={`/training?week=${addDays(monday, 7)}`}
          todayHref="/training"
          isCurrentWeek={isCurrentWeek}
          today={today}
          units={units}
        />
      </Suspense>
    </div>
  );
}
