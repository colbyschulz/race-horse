"use client";
import Link from "next/link";
import styles from "./PlanCard.module.scss";
import { Badge } from "@/components/Badge";
import { computeWeeksLeft } from "@/plans/stats";
import { formatDistance } from "@/lib/format";
import { formatDateRange } from "@/lib/dates";
import type { PlanWithCounts } from "@/plans/types";

type Status = "active" | "generating" | "upcoming" | "archived";

function statusOf(
  plan: { is_active: boolean; start_date: string; generation_status: "generating" | "complete" },
  today: string
): Status {
  if (plan.generation_status === "generating") return "generating";
  if (plan.is_active) return "active";
  if (plan.start_date > today) return "upcoming";
  return "archived";
}

function totalWeeks(start: string, end: string | null): number | null {
  if (!end) return null;
  const ms = new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000));
}

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  generating: "Generating…",
  upcoming: "Upcoming",
  archived: "Archived",
};

interface Props {
  plan: PlanWithCounts;
  today: string;
  units: "mi" | "km";
}

export function PlanCard({ plan, today, units }: Props) {
  const status = statusOf(plan, today);
  const goalLine = plan.goal?.target_time ?? plan.goal?.race_distance ?? null;
  const weeks = totalWeeks(plan.start_date, plan.end_date);
  const weeksLeft = status !== "archived" ? computeWeeksLeft(plan.end_date, today) : null;

  return (
    <Link href={`/plans/${plan.id}`} className={styles.cardLink}>
      <article className={`${styles.card} ${styles[`card_${status}`]}`}>
        <div className={styles.headRow}>
          <h2 className={styles.title}>{plan.title}</h2>
          <Badge variant={status} label={STATUS_LABEL[status]} />
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
