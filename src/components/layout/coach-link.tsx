"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./coach-link.module.scss";

export function CoachLink({ planId }: { planId?: string }) {
  const pathname = usePathname();
  const base = `/coach?from=${encodeURIComponent(pathname ?? "/")}`;
  const href = planId ? `${base}&plan_id=${encodeURIComponent(planId)}` : base;
  return (
    <Link href={href} className={styles.link}>
      <span aria-hidden>✦</span> Ask Coach
    </Link>
  );
}
