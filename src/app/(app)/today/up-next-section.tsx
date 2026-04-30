import { getNextWorkouts } from "@/plans/date-queries";
import { UpNext } from "./up-next";

export async function UpNextSection({
  userId,
  units,
  today,
}: {
  userId: string;
  units: "mi" | "km";
  today: string;
}) {
  const workouts = await getNextWorkouts(userId, today, 1);
  if (workouts.length === 0) return null;
  return <UpNext workouts={workouts} units={units} />;
}
