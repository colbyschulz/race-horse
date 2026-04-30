"use client";
import Link from "next/link";
import styles from "./context-pill.module.scss";
import { routeLabel } from "@/coach/context";

export function ContextPill({ fromRoute, fromLabel }: { fromRoute?: string; fromLabel?: string }) {
  const label = fromLabel ?? routeLabel(fromRoute);
  if (!label || !fromRoute) return null;
  return (
    <Link href={fromRoute} className={styles.pill}>
      ← Back to {label}
    </Link>
  );
}
