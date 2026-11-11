"use client";

import { use } from "react";
import { CSRSuspense } from "@/lib/csr-suspense";
import { WeekAgendaSkeleton } from "@/components/skeletons/week-agenda-skeleton";
import { PlanDetailContent } from "./plan-detail-content";
import styles from "./plan-detail.module.scss";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Like the tab pages, this is a shell: the plan and its workouts come from
// React Query, so opening a plan (or stepping through its weeks) shows cached
// data at once instead of waiting on a server render. The API routes behind
// those queries are what check that the plan belongs to the signed-in user.
export default function PlanDetailPage({ params }: PageProps) {
  const { id } = use(params);
  return (
    <div className={styles.page}>
      <CSRSuspense fallback={<WeekAgendaSkeleton />}>
        <PlanDetailContent planId={id} />
      </CSRSuspense>
    </div>
  );
}
