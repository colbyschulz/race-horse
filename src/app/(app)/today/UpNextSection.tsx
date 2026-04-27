import { getNextWorkouts } from "@/plans/dateQueries";
import { todayIso } from "@/lib/dates";
import { UpNext } from "./UpNext";

export async function UpNextSection({
  userId,
  units,
}: {
  userId: string;
  units: "mi" | "km";
}) {
  const today = todayIso();
  const workouts = await getNextWorkouts(userId, today, 2);
  if (workouts.length === 0) return null;
  return <UpNext workouts={workouts} units={units} />;
}
