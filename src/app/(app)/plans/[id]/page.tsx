import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getPlanById } from "@/plans/queries";
import { getWorkoutsForPlan } from "@/plans/dateQueries";
import { getActivitiesForDateRange } from "@/strava/dateQueries";
import { addDays, mondayOf, todayIso } from "@/lib/dates";
import { PlanDetailClient } from "./PlanDetailClient";
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

  const plan = await getPlanById(id, userId);
  if (!plan) notFound();

  const today = todayIso();
  const planFirstMonday = mondayOf(plan.start_date);
  // Day-before trick: a plan ending on a Monday doesn't generate a spurious extra week
  const planLastMonday = plan.end_date ? mondayOf(addDays(plan.end_date, -1)) : null;

  // Default to today's week if inside plan, else clamp to first/last week
  const defaultMonday =
    planLastMonday == null || mondayOf(today) <= planLastMonday
      ? mondayOf(today) >= planFirstMonday
        ? mondayOf(today)
        : planFirstMonday
      : planLastMonday;

  const monday =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? mondayOf(week) : defaultMonday;
  const sunday = addDays(monday, 6);

  const prevDisabled = monday <= planFirstMonday;
  const nextDisabled = !!planLastMonday && monday >= planLastMonday;
  const isCurrentWeek = monday === mondayOf(today);

  const [pref] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";

  const [allWorkouts, weekActivities] = await Promise.all([
    getWorkoutsForPlan(plan.id),
    getActivitiesForDateRange(userId, monday, sunday),
  ]);

  return (
    <div className={styles.page}>
      <PlanDetailClient
        plan={plan}
        monday={monday}
        prevHref={prevDisabled ? null : `/plans/${id}?week=${addDays(monday, -7)}`}
        nextHref={nextDisabled ? null : `/plans/${id}?week=${addDays(monday, 7)}`}
        todayHref={`/plans/${id}`}
        isCurrentWeek={isCurrentWeek}
        allWorkouts={allWorkouts}
        weekActivities={weekActivities}
        today={today}
        units={units}
      />
    </div>
  );
}
