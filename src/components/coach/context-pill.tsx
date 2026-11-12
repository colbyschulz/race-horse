"use client";
import Link from "next/link";
import styles from "./context-pill.module.scss";
import { routeLabel } from "@/lib/route-label";

const FALLBACK_ROUTE = "/plans";
const FALLBACK_LABEL = "Plans";

/**
 * The way out of the coach page. The tab bar is hidden there, so on a phone
 * this link is the only navigation on screen. A conversation opened without a
 * page to go back to (a new build, for one) leads to the plans list.
 */
export function ContextPill({ fromRoute, fromLabel }: { fromRoute?: string; fromLabel?: string }) {
  const knownLabel = fromRoute ? (fromLabel ?? routeLabel(fromRoute)) : null;
  const href = fromRoute && knownLabel ? fromRoute : FALLBACK_ROUTE;
  const label = fromRoute && knownLabel ? knownLabel : FALLBACK_LABEL;
  return (
    <Link href={href} className={styles.pill}>
      <span className={styles.label}>← Back to {label}</span>
    </Link>
  );
}
