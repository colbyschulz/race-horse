import { getWorkoutsForPlan } from "@/plans/dateQueries";
import { getActivitiesForDateRange } from "@/strava/dateQueries";
import { PlanDetailClient } from "./PlanDetailClient";
import type { Plan } from "@/plans/types";

interface Props {
  plan: Plan;
  userId: string;
  monday: string;
  sunday: string;
  prevHref: string | null;
  nextHref: string | null;
  todayHref: string;
  isCurrentWeek: boolean;
  today: string;
  units: "mi" | "km";
}

export async function PlanWeekSection({
  plan,
  userId,
  monday,
  sunday,
  prevHref,
  nextHref,
  todayHref,
  isCurrentWeek,
  today,
  units,
}: Props) {
  const [allWorkouts, weekActivities] = await Promise.all([
    getWorkoutsForPlan(plan.id),
    getActivitiesForDateRange(userId, monday, sunday),
  ]);
  return (
    <PlanDetailClient
      plan={plan}
      monday={monday}
      prevHref={prevHref}
      nextHref={nextHref}
      todayHref={todayHref}
      isCurrentWeek={isCurrentWeek}
      allWorkouts={allWorkouts}
      weekActivities={weekActivities}
      today={today}
      units={units}
    />
  );
}
