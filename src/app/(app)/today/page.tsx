import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getActivePlan } from "@/plans/date-queries";
import { todayIso, formatLongDate } from "@/lib/dates";
import { HeroSection } from "./hero-section";
import { HeroSkeleton } from "./hero-skeleton";
import { ActivitiesSection } from "./activities-section";
import { ActivitiesSkeleton } from "./activities-skeleton";
import { UpNextSection } from "./up-next-section";
import { UpNextSkeleton } from "./up-next-skeleton";
import { EmptyState } from "@/components/empty-state/empty-state";
import { CoachLink } from "@/components/layout/coach-link";
import { PageHeader } from "@/components/layout/page-header";
import styles from "./today.module.scss";

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
      <PageHeader
        title={formatLongDate(today)}
        subtitle={activePlan?.title}
        actions={<CoachLink planId={activePlan?.id} />}
      />

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
