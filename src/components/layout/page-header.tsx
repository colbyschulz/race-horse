import type { ReactNode } from "react";
import styles from "./page-header.module.scss";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {(subtitle || actions) && (
        <div className={styles.subtitleRow}>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
    </header>
  );
}
