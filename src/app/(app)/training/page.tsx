import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getActivePlan, getWorkoutsForDateRange } from "@/server/plans/date-queries";
import { getActivitiesForDateRange } from "@/server/strava/date-queries";
import { addDays, mondayOf, todayIso, isIsoDate } from "@/lib/dates";
import { TrainingContent } from "./training-content";
import styles from "./training.module.scss";

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;

  const params = await searchParams;
  const week = typeof params.week === "string" ? params.week : undefined;
  const today = todayIso(prefs.timezone);
  const monday = isIsoDate(week) ? mondayOf(week) : mondayOf(today);
  const sunday = addDays(monday, 6);

  const [activePlan, workouts, activities] = await Promise.all([
    getActivePlan(userId),
    getWorkoutsForDateRange(userId, monday, sunday),
    getActivitiesForDateRange(userId, monday, sunday),
  ]);

  const queryClient = new QueryClient();
  const s = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["plans", "active"], s(activePlan));
  queryClient.setQueryData(["workouts", { from: monday, to: sunday }], s(workouts));
  queryClient.setQueryData(["activities", { from: monday, to: sunday }], s(activities));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className={styles.page}>
        <TrainingContent />
      </div>
    </HydrationBoundary>
  );
}
