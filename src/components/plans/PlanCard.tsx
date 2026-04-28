"use client";
import Link from "next/link";
import styles from "./PlanCard.module.scss";
import { computeWeeksLeft } from "@/plans/stats";
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

function totalWeeks(start: string, end: string | null): number | null {
  if (!end) return null;
  const ms = new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000));
}

function fmtDist(meters: number, units: "mi" | "km"): string {
  const val = units === "mi" ? meters / 1609.344 : meters / 1000;
  return val.toFixed(1);
}

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
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
          <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className={styles.meta}>
          {fmtDateRange(plan.start_date, plan.end_date)}
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
            <span className={styles.statValue}>{fmtDist(Number(plan.max_weekly_meters), units)}</span>
            <span className={styles.statLabel}>Max wk ({units})</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{fmtDist(Number(plan.longest_run_meters), units)}</span>
            <span className={styles.statLabel}>Long run ({units})</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
