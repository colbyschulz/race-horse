import { getWorkoutsForDateRange } from "@/plans/date-queries";
import { getActivitiesForDateRange } from "@/strava/date-queries";
import { TrainingClient } from "./training-client";

interface Props {
  userId: string;
  planId: string;
  planTitle: string;
  monday: string;
  sunday: string;
  weekTitle: string;
  weekRange: string;
  prevHref: string | null;
  nextHref: string;
  todayHref: string;
  isCurrentWeek: boolean;
  today: string;
  units: "mi" | "km";
}

export async function WeekAgendaSection({
  userId,
  planId,
  planTitle,
  monday,
  sunday,
  weekTitle,
  weekRange,
  prevHref,
  nextHref,
  todayHref,
  isCurrentWeek,
  today,
  units,
}: Props) {
  const [workouts, activities] = await Promise.all([
    getWorkoutsForDateRange(userId, monday, sunday),
    getActivitiesForDateRange(userId, monday, sunday),
  ]);
  return (
    <TrainingClient
      planTitle={planTitle}
      monday={monday}
      weekTitle={weekTitle}
      weekRange={weekRange}
      prevHref={prevHref}
      nextHref={nextHref}
      todayHref={todayHref}
      isCurrentWeek={isCurrentWeek}
      workouts={workouts}
      activities={activities}
      today={today}
      units={units}
      activePlanId={planId}
    />
  );
}
