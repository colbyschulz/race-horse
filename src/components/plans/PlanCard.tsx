"use client";
import Link from "next/link";
import styles from "./PlanCard.module.scss";
import { computeWeeksLeft, formatGoal } from "@/plans/stats";
import type { PlanWithCounts } from "@/plans/types";

type Status = "active" | "upcoming" | "archived";

function statusOf(plan: { is_active: boolean; start_date: string }, today: string): Status {
  if (plan.is_active) return "active";
  if (plan.start_date > today) return "upcoming";
  return "archived";
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDateRange(start: string, end: string | null): string {
  return end ? `${fmtDate(start)} – ${fmtDate(end)}` : `${fmtDate(start)} · ongoing`;
}

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  upcoming: "Upcoming",
  archived: "Archived",
};

interface Props {
  plan: PlanWithCounts;
  today: string;
}

export function PlanCard({ plan, today }: Props) {
  const status = statusOf(plan, today);
  const goalLine = formatGoal(plan.goal);
  const weeksLeft = status !== "archived" ? computeWeeksLeft(plan.end_date, today) : null;

  return (
    <Link href={`/plans/${plan.id}`} className={styles.cardLink}>
      <article className={`${styles.card} ${styles[`card_${status}`]}`}>
        <div className={styles.headRow}>
          <h2 className={styles.title}>{plan.title}</h2>
          <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className={styles.meta}>
          {fmtDateRange(plan.start_date, plan.end_date)}
          {goalLine ? ` · ${goalLine}` : ""}
        </p>
        <div className={styles.stats}>
          {weeksLeft != null && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{weeksLeft}</span>
              <span className={styles.statLabel}>Weeks left</span>
            </div>
          )}
          <div className={styles.stat}>
            <span className={styles.statValue}>{plan.workout_count}</span>
            <span className={styles.statLabel}>Workouts</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{plan.completed_count}</span>
            <span className={styles.statLabel}>Completed</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
