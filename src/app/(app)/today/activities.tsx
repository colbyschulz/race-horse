"use client";

import { ActivityRow } from "@/components/activities/activity-row";
import { useActivities } from "@/queries/activities";
import styles from "./today.module.scss";

export function Activities({ units, today }: { units: "mi" | "km"; today: string }) {
  const { data: activities } = useActivities(today, today);
  if (activities.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Completed</h2>
      <div className={styles.activityList}>
        {activities.map((a) => (
          <ActivityRow key={a.id} activity={a} units={units} />
        ))}
      </div>
    </section>
  );
}
