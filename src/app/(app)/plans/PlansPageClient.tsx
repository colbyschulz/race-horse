"use client";

import styles from "./Plans.module.scss";
import { ActivePlanCard } from "@/components/plans/ActivePlanCard";
import { ArchivedPlanCard } from "@/components/plans/ArchivedPlanCard";
import { PlanActionRow } from "@/components/plans/PlanActionRow";
import { PlansEmptyState } from "@/components/plans/PlansEmptyState";
import type { PlanWithCounts } from "@/plans/types";

interface Props {
  plans: PlanWithCounts[];
  today: string;
}

export function PlansPageClient({ plans, today }: Props) {
  const active = plans.find((p) => p.is_active) ?? null;
  const archived = plans.filter((p) => !p.is_active);

  return (
    <div className={styles.page}>
      <h1 className={styles.header}>Plans</h1>
      <PlanActionRow />

      {!active && archived.length === 0 && <PlansEmptyState />}

      {active && (
        <ActivePlanCard
          plan={active}
          today={today}
        />
      )}

      {archived.length > 0 && (
        <>
          <div className={styles.archivedLabel}>Archived</div>
          <div className={styles.archivedList}>
            {archived.map((p) => (
              <ArchivedPlanCard
                key={p.id}
                plan={p}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
