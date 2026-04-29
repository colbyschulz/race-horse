"use client";

import styles from "./Plans.module.scss";
import { PlanCard } from "@/components/plans/PlanCard";
import { UploadDropzone } from "@/components/plans/UploadDropzone";
import { EmptyState } from "@/components/EmptyState";
import { InFlightUploadCard } from "@/components/plans/InFlightUploadCard";
import type { PlanWithCounts } from "@/plans/types";

interface Props {
  plans: PlanWithCounts[];
  today: string;
  units: "mi" | "km";
  planFiles: {
    id: string;
    status: "extracting" | "extracted" | "failed";
    original_filename: string;
    extraction_error: string | null;
  }[];
}

export function PlansPageClient({ plans, today, planFiles, units }: Props) {
  // Active plan first, then rest in existing order
  const sorted = [
    ...plans.filter((p) => p.is_active),
    ...plans.filter((p) => !p.is_active),
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.header}>Plans</h1>
      <UploadDropzone />

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
            <PlanCard key={p.id} plan={p} today={today} units={units} />
          ))}
        </div>
      )}
    </div>
  );
}
