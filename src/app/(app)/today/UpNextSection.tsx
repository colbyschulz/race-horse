import { getNextWorkouts } from "@/plans/dateQueries";
import { UpNext } from "./UpNext";

export async function UpNextSection({
  userId,
  units,
  today,
}: {
  userId: string;
  units: "mi" | "km";
  today: string;
}) {
  const workouts = await getNextWorkouts(userId, today, 2);
  if (workouts.length === 0) return null;
  return <UpNext workouts={workouts} units={units} />;
}
