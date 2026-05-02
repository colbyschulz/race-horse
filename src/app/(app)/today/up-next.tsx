"use client";

import { WorkoutDayCard } from "@/components/workouts/workout-day-card";
import { useNextWorkouts } from "@/queries/workouts";
import styles from "./today.module.scss";

export function UpNext({ units, today }: { units: "mi" | "km"; today: string }) {
  const { data: workouts } = useNextWorkouts(today, 1);
  if (workouts.length === 0) return null;

  return (
    <section className={styles.upNextSection}>
      <h2 className={styles.h2}>Up next</h2>
      <ul className={styles.upNextList}>
        {workouts.map((w) => (
          <li key={w.id}>
            <WorkoutDayCard
              date={w.date}
              workout={w}
              units={units}
              showNotes
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
