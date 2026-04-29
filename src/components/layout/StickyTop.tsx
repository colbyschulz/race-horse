import type { ReactNode } from "react";
import styles from "./StickyTop.module.scss";

export function StickyTop({ children }: { children: ReactNode }) {
  return <div className={styles.sticky}>{children}</div>;
}
