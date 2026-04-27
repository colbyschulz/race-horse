"use client";
import styles from "./PlanMeta.module.scss";

// Permissive shape so we accept both DB `Goal` (optional fields) and
// `ExtractedPlan["goal"]` (nullable fields).
export interface GoalLike {
  race_date?: string | null;
  race_distance?: string | null;
  target_time?: string | null;
}

interface Props {
  startDate: string;
  endDate: string | null;
  mode: string;
  goal?: GoalLike | null;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.item}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}

export function PlanMeta({ startDate, endDate, mode, goal }: Props) {
  const items: { label: string; value: string }[] = [
    { label: "Starts", value: fmtDate(startDate) },
  ];

  if (endDate) {
    items.push({ label: "Ends", value: fmtDate(endDate) });
  }

  if (mode === "goal" && goal?.race_date) {
    items.push({ label: "Race date", value: fmtDate(goal.race_date) });
  }
  if (mode === "goal" && goal?.race_distance) {
    items.push({ label: "Distance", value: goal.race_distance });
  }
  if (mode === "goal" && goal?.target_time) {
    items.push({ label: "Goal time", value: goal.target_time });
  }

  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <MetaItem key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  );
}
