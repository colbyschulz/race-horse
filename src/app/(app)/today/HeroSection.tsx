import { getWorkoutsForDateRange } from "@/plans/dateQueries";
import { todayIso } from "@/lib/dates";
import { HeroWorkout } from "./HeroWorkout";
import styles from "./Today.module.scss";

export async function HeroSection({
  userId,
  units,
}: {
  userId: string;
  units: "mi" | "km";
}) {
  const today = todayIso();
  const workouts = await getWorkoutsForDateRange(userId, today, today);
  if (workouts.length === 0) {
    return <div className={styles.restCard}>Rest day. Take it easy.</div>;
  }
  return <HeroWorkout workout={workouts[0]} units={units} />;
}
