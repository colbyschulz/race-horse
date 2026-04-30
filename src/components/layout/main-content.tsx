"use client";

import { usePathname } from "next/navigation";
import styles from "./app-shell.module.scss";

export function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCoach = pathname.startsWith("/coach");
  return (
    <main className={isCoach ? styles.mainNoTabBar : styles.main}>
      {children}
    </main>
  );
}
