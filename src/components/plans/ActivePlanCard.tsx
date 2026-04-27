"use client";

import Link from "next/link";
import styles from "./ActivePlanCard.module.scss";
import {
  computeWeeksLeft,
  formatDuration,
  formatGoal,
  formatSport,
} from "@/plans/stats";
import type { PlanWithCounts } from "@/plans/types";

interface Props {
  plan: PlanWithCounts;
  today: string;
}

export function ActivePlanCard({ plan, today }: Props) {
  const weeksLeft = computeWeeksLeft(plan.end_date, today);
  const goalLine = formatGoal(plan.goal);

  return (
    <Link
      href={`/plans/${plan.id}`}
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <article className={styles.card}>
        <div className={styles.headRow}>
          <h2 className={styles.title}>{plan.title}</h2>
          <span className={styles.activePill}>Active</span>
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaItem}>{formatSport(plan.sport)}</span>
          <span className={styles.metaItem}>{formatDuration(plan.start_date, plan.end_date)}</span>
          {goalLine && <span className={styles.metaItem}>{goalLine}</span>}
        </div>

        <div className={styles.statGrid}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{weeksLeft ?? "—"}</span>
            <span className={styles.statLabel}>Weeks left</span>
          </div>
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
