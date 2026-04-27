import { getActivitiesForDateRange } from "@/strava/dateQueries";
import { todayIso } from "@/lib/dates";
import { ActivityRow } from "@/components/activities/ActivityRow";
import styles from "./Today.module.scss";

export async function ActivitiesSection({
  userId,
  units,
}: {
  userId: string;
  units: "mi" | "km";
}) {
  const today = todayIso();
  const activities = await getActivitiesForDateRange(userId, today, today);
  if (activities.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Today&apos;s activities</h2>
      <div className={styles.activityList}>
        {activities.map((a) => (
          <ActivityRow key={a.id} activity={a} units={units} />
        ))}
      </div>
    </section>
  );
}
