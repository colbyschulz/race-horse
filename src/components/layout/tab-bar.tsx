"use client";

import { usePathname } from "next/navigation";
import { NavLinks } from "./nav-links";
import styles from "./app-shell.module.scss";

export function TabBar() {
  const pathname = usePathname();
  if (pathname.startsWith("/coach")) return null;
  return (
    <div className={styles.tabBar}>
      <NavLinks variant="tabs" />
    </div>
  );
}
