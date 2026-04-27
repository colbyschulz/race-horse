"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./CoachLink.module.scss";

export function CoachLink() {
  const pathname = usePathname();
  const href = `/coach?from=${encodeURIComponent(pathname ?? "/")}`;
  return (
    <Link href={href} className={styles.link}>
      <span aria-hidden>✦</span> Ask Coach
    </Link>
  );
}
