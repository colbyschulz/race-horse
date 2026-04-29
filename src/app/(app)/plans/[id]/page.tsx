import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getPlanById } from "@/plans/queries";
import { addDays, mondayOf, todayIso } from "@/lib/dates";
import { planNavBounds } from "@/lib/planNav";
import { PlanWeekSection } from "./PlanWeekSection";
import { WeekAgendaSkeleton } from "@/app/(app)/training/WeekAgendaSkeleton";
import styles from "./PlanDetail.module.scss";

export default async function PlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const { id } = await params;
  const { week } = await searchParams;

  const [[pref], plan] = await Promise.all([
    db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1),
    getPlanById(id, userId),
  ]);
  if (!plan) notFound();

  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";
  const today = todayIso();
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

  const monday = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? mondayOf(week) : defaultMonday;
  const sunday = addDays(monday, 6);

  const { prevDisabled, nextDisabled } = planNavBounds(plan.start_date, plan.end_date, monday);
  const isCurrentWeek = monday === mondayOf(today);

  return (
    <div className={styles.page}>
      <Suspense fallback={<WeekAgendaSkeleton />}>
        <PlanWeekSection
          plan={plan}
          userId={userId}
          monday={monday}
          sunday={sunday}
          prevHref={prevDisabled ? null : `/plans/${id}?week=${addDays(monday, -7)}`}
          nextHref={nextDisabled ? null : `/plans/${id}?week=${addDays(monday, 7)}`}
          todayHref={`/plans/${id}`}
          isCurrentWeek={isCurrentWeek}
          today={today}
          units={units}
        />
      </Suspense>
    </div>
  );
}
