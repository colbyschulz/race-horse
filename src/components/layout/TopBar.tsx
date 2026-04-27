"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppShell.module.scss";

export function TopBar() {
  const pathname = usePathname();
  if (pathname === "/coach" || pathname === "/settings") return null;
  const href = pathname ? `/coach?from=${encodeURIComponent(pathname)}` : "/coach";
  return (
    <div className={styles.topBar}>
      <Link href={href} className={styles.topBarCoach}>
        <span aria-hidden>✦</span> Coach
      </Link>
    </div>
  );
}
