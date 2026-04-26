"use client";
import Link from "next/link";
import styles from "./ContextPill.module.scss";
import { routeLabel } from "@/coach/context";

export function ContextPill({ fromRoute }: { fromRoute?: string }) {
  const label = routeLabel(fromRoute);
  if (!label) return null;
  return (
    <Link href={fromRoute!} className={styles.pill}>
      ← Back to {label}
    </Link>
  );
}
