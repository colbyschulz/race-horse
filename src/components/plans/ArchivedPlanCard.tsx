"use client";

import Link from "next/link";
import styles from "./ArchivedPlanCard.module.scss";
import { formatDuration, formatSport } from "@/plans/stats";
import type { PlanWithCounts } from "@/plans/types";

const SOURCE_LABEL: Record<string, string> = {
  uploaded: "uploaded",
  coach_generated: "coach-generated",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonthYear(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

interface Props {
  plan: PlanWithCounts;
}

export function ArchivedPlanCard({ plan }: Props) {
  return (
    <Link
      href={`/plans/${plan.id}`}
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <article className={styles.card}>
        <div className={styles.headRow}>
          <h3 className={styles.title}>{plan.title}</h3>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            {formatSport(plan.sport)} · {formatDuration(plan.start_date, plan.end_date)} · {SOURCE_LABEL[plan.source] ?? plan.source}
          </span>
          <span className={styles.metaItem}>{formatMonthYear(plan.start_date)}</span>
        </div>
      </article>
    </Link>
  );
}
