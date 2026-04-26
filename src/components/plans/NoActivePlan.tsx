"use client";
import Link from "next/link";
import styles from "./NoActivePlan.module.scss";

export function NoActivePlan({ context }: { context: "today" | "calendar" }) {
  const subline =
    context === "today"
      ? "Your training will show up here once you activate a plan."
      : "Your weekly schedule will show up here once you activate a plan.";
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>No active plan</h2>
      <p className={styles.subline}>{subline}</p>
      <Link href="/plans" className={styles.cta}>Go to Plans →</Link>
    </div>
  );
}
