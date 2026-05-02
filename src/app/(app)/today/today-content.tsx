"use client";

import { Suspense } from "react";
import { todayIso, formatLongDate } from "@/lib/dates";
import { HeroWorkout } from "./hero-workout";
import { Activities } from "./activities";
import { UpNext } from "./up-next";
import { HeroSkeleton } from "@/components/skeletons/hero-skeleton";
import { ActivitiesSkeleton } from "@/components/skeletons/activities-skeleton";
import { UpNextSkeleton } from "@/components/skeletons/up-next-skeleton";
import { EmptyState } from "@/components/empty-state/empty-state";
import { CoachLink } from "@/components/layout/coach-link";
import { PageHeader } from "@/components/layout/page-header";
import { usePreferences } from "@/queries/preferences";
import { useActivePlan } from "@/queries/plans";
import styles from "./today.module.scss";

export function TodayContent() {
  const { data: prefs } = usePreferences();
  const { data: activePlan } = useActivePlan();
  const today = todayIso(prefs.timezone);

  return (
    <>
      <PageHeader
        title={formatLongDate(today)}
        subtitle={activePlan?.title}
        actions={<CoachLink planId={activePlan?.id} />}
      />

      <div className={styles.scrollArea}>
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
            <HeroWorkout units={prefs.units} today={today} />
          </Suspense>
        )}

        <Suspense fallback={<ActivitiesSkeleton />}>
          <Activities units={prefs.units} today={today} />
        </Suspense>

        {activePlan && (
          <Suspense fallback={<UpNextSkeleton />}>
            <UpNext units={prefs.units} today={today} />
          </Suspense>
        )}
      </div>
    </>
  );
}
