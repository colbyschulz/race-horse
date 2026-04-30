import { getWorkoutsForPlan } from "@/plans/date-queries";
import { getActivitiesForDateRange } from "@/strava/date-queries";
import { PlanDetailClient } from "./plan-detail-client";
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
