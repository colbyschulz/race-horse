import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getActivePlan, getWorkoutsForDateRange, getNextWorkouts } from "@/server/plans/date-queries";
import { getActivitiesForDateRange } from "@/server/strava/date-queries";
import { todayIso } from "@/lib/dates";
import { TodayContent } from "./today-content";
import styles from "./today.module.scss";

export default async function TodayPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;
  const today = todayIso(prefs.timezone);

  const [activePlan, workoutsToday, activitiesToday, nextWorkouts] = await Promise.all([
    getActivePlan(userId),
    getWorkoutsForDateRange(userId, today, today),
    getActivitiesForDateRange(userId, today, today),
    getNextWorkouts(userId, today, 1),
  ]);

  const queryClient = new QueryClient();
  // JSON round-trip serializes Date objects to ISO strings (matches /api/* JSON responses)
  const s = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["plans", "active"], s(activePlan));
  queryClient.setQueryData(["workouts", { from: today, to: today }], s(workoutsToday));
  queryClient.setQueryData(["activities", { from: today, to: today }], s(activitiesToday));
  queryClient.setQueryData(["workouts", "next", { after: today, limit: 1 }], s(nextWorkouts));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className={styles.page}>
        <TodayContent />
      </div>
    </HydrationBoundary>
  );
}
