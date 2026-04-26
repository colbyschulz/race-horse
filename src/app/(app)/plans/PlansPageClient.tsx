"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

async function patchPlan(id: string, body: { is_active: boolean }): Promise<void> {
  const res = await fetch(`/api/plans/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH /api/plans/${id} failed: ${res.status}`);
}

async function deletePlanReq(id: string): Promise<void> {
  const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/plans/${id} failed: ${res.status}`);
}

export function PlansPageClient({ plans, today }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
      refresh();
    } catch (err) {
      console.error(err);
      alert("Action failed — please try again.");
    } finally {
      setBusyId(null);
    }
  }

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
          busy={busyId === active.id}
          onArchive={() =>
            withBusy(active.id, () => patchPlan(active.id, { is_active: false }))
          }
          onDelete={() => {
            if (!confirm(`Delete "${active.title}"? This cannot be undone.`)) return;
            void withBusy(active.id, () => deletePlanReq(active.id));
          }}
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
                busy={busyId === p.id}
                onRestore={() =>
                  withBusy(p.id, () => patchPlan(p.id, { is_active: true }))
                }
                onDelete={() => {
                  if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
                  void withBusy(p.id, () => deletePlanReq(p.id));
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
