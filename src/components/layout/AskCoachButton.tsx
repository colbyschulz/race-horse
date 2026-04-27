"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AskCoachButton.module.scss";

export function AskCoachButton() {
  const pathname = usePathname();
  if (pathname === "/coach" || pathname === "/settings") return null;
  const href = pathname ? `/coach?from=${encodeURIComponent(pathname)}` : "/coach";
  return (
    <Link href={href} className={styles.fab} aria-label="Ask coach">
      <span aria-hidden>✦</span>
      Coach
    </Link>
  );
}
