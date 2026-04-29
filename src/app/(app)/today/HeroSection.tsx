import { getWorkoutsForDateRange } from "@/plans/dateQueries";
import { HeroWorkout } from "./HeroWorkout";
import styles from "./Today.module.scss";

export async function HeroSection({
  userId,
  units,
  today,
}: {
  userId: string;
  units: "mi" | "km";
  today: string;
}) {
  const workouts = await getWorkoutsForDateRange(userId, today, today);
  if (workouts.length === 0) {
    return <div className={styles.restCard}>Rest day. Take it easy.</div>;
  }
  return <HeroWorkout workout={workouts[0]} units={units} />;
}
