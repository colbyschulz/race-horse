"use client";

import { useState } from "react";
import { WorkoutDayCard } from "@/components/workouts/workout-day-card";
import { WorkoutDetailSheet } from "@/components/workouts/workout-detail-sheet";
import { useNextWorkouts } from "@/queries/workouts";
import { useActivePlan } from "@/queries/plans";
import type { WorkoutRow } from "@/types/plans";
import styles from "./today.module.scss";

export function UpNext({ units, today }: { units: "mi" | "km"; today: string }) {
  const { data: workouts } = useNextWorkouts(today, 1);
  const { data: activePlan } = useActivePlan();
  const [openWorkout, setOpenWorkout] = useState<WorkoutRow | null>(null);

  if (workouts.length === 0) return null;

  return (
    <>
      <section className={styles.upNextSection}>
        <h2 className={styles.h2}>Up next</h2>
        <ul className={styles.upNextList}>
          {workouts.map((w) => (
            <li key={w.id}>
              <WorkoutDayCard
                date={w.date}
                workout={w}
                units={units}
                onClick={() => setOpenWorkout(w)}
              />
            </li>
          ))}
        </ul>
      </section>
      <WorkoutDetailSheet
        workout={openWorkout}
        planId={activePlan?.id}
        units={units}
        onClose={() => setOpenWorkout(null)}
      />
    </>
  );
}
