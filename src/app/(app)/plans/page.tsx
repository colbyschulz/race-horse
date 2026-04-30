"use client";

import { CSRSuspense } from "@/lib/csr-suspense";
import { todayIso } from "@/lib/dates";
import { PlanCard } from "@/components/plans/plan-card";
import { UploadDropzone } from "@/components/plans/upload-dropzone";
import { EmptyState } from "@/components/empty-state/empty-state";
import { InFlightUploadCard } from "@/components/plans/in-flight-upload-card";
import { PageHeader } from "@/components/layout/page-header";
import { usePreferences } from "@/queries/preferences";
import { usePlans, useInFlightPlanFiles } from "@/queries/plans";
import { PlansListSkeleton } from "@/components/skeletons/plans-list-skeleton";
import styles from "./plans.module.scss";

export default function PlansPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Plans" />
      <UploadDropzone />
      <CSRSuspense fallback={<PlansListSkeleton />}>
        <PlansList />
      </CSRSuspense>
    </div>
  );
}

function PlansList() {
  const { data: prefs } = usePreferences();
  const { data: plans } = usePlans();
  const { data: planFiles } = useInFlightPlanFiles();

  const today = todayIso(prefs.timezone);
  const sorted = [...plans.filter((p) => p.is_active), ...plans.filter((p) => !p.is_active)];

  return (
    <>
      {planFiles.length > 0 && (
        <section className={styles.inflight}>
          {planFiles.map((f) => (
            <InFlightUploadCard key={f.id} row={f} />
          ))}
        </section>
      )}

      {plans.length === 0 && planFiles.length === 0 && (
        <EmptyState
          title="No plans yet"
          body="Once the coach is online or upload is wired up, your plans will live here."
          variant="bordered"
          size="sm"
        />
      )}

      {sorted.length > 0 && (
        <div className={styles.planList}>
          {sorted.map((p) => (
            <PlanCard key={p.id} plan={p} today={today} units={prefs.units} />
          ))}
        </div>
      )}
    </>
  );
}
