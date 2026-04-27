import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getActivePlan, getWorkoutsForDateRange, getNextWorkouts } from "@/plans/dateQueries";
import { getActivitiesForDateRange } from "@/strava/dateQueries";
import { todayIso, formatLongDate } from "@/lib/dates";
import { HeroWorkout } from "./HeroWorkout";
import { UpNext } from "./UpNext";
import { ActivityRow } from "@/components/activities/ActivityRow";
import { NoActivePlan } from "@/components/plans/NoActivePlan";
import { CoachLink } from "@/components/layout/CoachLink";
import styles from "./Today.module.scss";

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const today = todayIso();

  const [pref] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";

  const activePlan = await getActivePlan(userId);
  const todaysWorkouts = activePlan ? await getWorkoutsForDateRange(userId, today, today) : [];
  const upNext = activePlan ? await getNextWorkouts(userId, today, 2) : [];
  const todaysActivities = await getActivitiesForDateRange(userId, today, today);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <h1 className={styles.date}>{formatLongDate(today)}</h1>
          {activePlan && <p className={styles.planTitle}>{activePlan.title}</p>}
        </div>
        <CoachLink />
      </header>

      {!activePlan && <NoActivePlan context="today" />}

      {activePlan && (todaysWorkouts.length > 0
        ? <HeroWorkout workout={todaysWorkouts[0]} units={units} />
        : <div className={styles.restCard}>Rest day. Take it easy.</div>
      )}

      {todaysActivities.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.h2}>Today&apos;s activities</h2>
          <div className={styles.activityList}>
            {todaysActivities.map((a) => <ActivityRow key={a.id} activity={a} units={units} />)}
          </div>
        </section>
      )}

      {activePlan && upNext.length > 0 && <UpNext workouts={upNext} units={units} />}
    </div>
  );
}
