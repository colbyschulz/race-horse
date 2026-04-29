import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getActivePlan } from "@/plans/dateQueries";
import { todayIso, formatLongDate } from "@/lib/dates";
import { HeroSection } from "./HeroSection";
import { HeroSkeleton } from "./HeroSkeleton";
import { ActivitiesSection } from "./ActivitiesSection";
import { ActivitiesSkeleton } from "./ActivitiesSkeleton";
import { UpNextSection } from "./UpNextSection";
import { UpNextSkeleton } from "./UpNextSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { CoachLink } from "@/components/layout/CoachLink";
import styles from "./Today.module.scss";

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const [[pref], activePlan] = await Promise.all([
    db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1),
    getActivePlan(userId),
  ]);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";
  const tz = (pref?.preferences as { timezone?: string } | null)?.timezone;
  const today = todayIso(tz);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <h1 className={styles.date}>{formatLongDate(today)}</h1>
          {activePlan && <p className={styles.planTitle}>{activePlan.title}</p>}
        </div>
        <CoachLink planId={activePlan?.id} />
      </header>

      {!activePlan && (
        <EmptyState
          title="No active plan"
          body="Your training will show up here once you activate a plan."
          variant="tinted"
          size="sm"
          action={{ label: "Go to Plans →", href: "/plans" }}
        />
      )}

      {activePlan && (
        <Suspense fallback={<HeroSkeleton />}>
          <HeroSection userId={userId} units={units} today={today} />
        </Suspense>
      )}

      <Suspense fallback={activePlan ? <ActivitiesSkeleton /> : null}>
        <ActivitiesSection userId={userId} units={units} today={today} />
      </Suspense>

      {activePlan && (
        <Suspense fallback={<UpNextSkeleton />}>
          <UpNextSection userId={userId} units={units} today={today} />
        </Suspense>
      )}
    </div>
  );
}
