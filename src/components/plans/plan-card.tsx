"use client";
import Link from "next/link";
import styles from "./plan-card.module.scss";
import { Badge } from "@/components/badge/badge";
import { computeWeeksLeft } from "@/lib/plan-format";
import { PLAN_STATUS_LABEL, planStatus } from "@/lib/plan-status";
import { formatDistance } from "@/lib/format";
import { formatDateRange } from "@/lib/dates";
import type { PlanWithCounts } from "@/types/plans";

function totalWeeks(start: string, end: string | null): number | null {
  if (!end) return null;
  const ms = new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000));
}

interface Props {
  plan: PlanWithCounts;
  today: string;
  units: "mi" | "km";
}

export function PlanCard({ plan, today, units }: Props) {
  const status = planStatus(plan, today);
  const goalLine = plan.goal?.target_time ?? plan.goal?.race_distance ?? null;
  const weeks = totalWeeks(plan.start_date, plan.end_date);
  const weeksLeft = status !== "archived" ? computeWeeksLeft(plan.end_date, today) : null;

  // A plan still being built may be incomplete or waiting at a check-in, and its
  // detail page has no way back to the coach conversation, so route straight
  // into the coach thread that's building it instead.
  const href =
    status === "generating"
      ? `/coach?plan_id=${encodeURIComponent(plan.id)}&from=${encodeURIComponent("/plans")}&from_label=${encodeURIComponent(plan.title)}`
      : `/plans/${plan.id}`;

  return (
    <Link href={href} className={styles.cardLink}>
      <article className={`${styles.card} ${styles[`card_${status}`]}`}>
        <div className={styles.headRow}>
          <h2 className={styles.title}>{plan.title}</h2>
          <Badge variant={status} label={PLAN_STATUS_LABEL[status]} />
        </div>
        <p className={styles.meta}>
          {formatDateRange(plan.start_date, plan.end_date)}
          {goalLine ? ` · Goal: ${goalLine}` : ""}
        </p>
        <div className={styles.stats}>
          {weeks != null && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{weeks}</span>
              <span className={styles.statLabel}>Weeks</span>
            </div>
          )}
          {weeksLeft != null && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{weeksLeft}</span>
              <span className={styles.statLabel}>Left</span>
            </div>
          )}
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {formatDistance(Number(plan.max_weekly_meters), units) ?? "—"}
            </span>
            <span className={styles.statLabel}>Max wk ({units})</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {formatDistance(Number(plan.longest_run_meters), units) ?? "—"}
            </span>
            <span className={styles.statLabel}>Long run ({units})</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
