import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getActivePlan } from "@/plans/date-queries";
import { addDays, mondayOf, todayIso, formatDateShort, weekIndexFromStart } from "@/lib/dates";
import { planNavBounds } from "@/lib/plan-nav";
import { WeekAgendaSection } from "./week-agenda-section";
import { WeekAgendaSkeleton } from "./week-agenda-skeleton";
import { EmptyState } from "@/components/empty-state/empty-state";
import styles from "./calendar.module.scss";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const { week } = await searchParams;

  const [[pref], activePlan] = await Promise.all([
    db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1),
    getActivePlan(userId),
  ]);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";
  const tz = (pref?.preferences as { timezone?: string } | null)?.timezone;
  const today = todayIso(tz);
  const monday = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? mondayOf(week) : mondayOf(today);
  const sunday = addDays(monday, 6);

  if (!activePlan) {
    return (
      <div className={styles.page}>
        <EmptyState
          title="No active plan"
          body="Your weekly schedule will show up here once you activate a plan."
          variant="tinted"
          size="sm"
          action={{ label: "Go to Plans →", href: "/plans" }}
        />
      </div>
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
