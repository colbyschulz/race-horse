"use client";
import styles from "./plan-heading.module.scss";

interface Props {
  title: string;
  subline?: string;
  sublineAction?: React.ReactNode;
  actions?: React.ReactNode;
  subRow?: React.ReactNode;
}

export function PlanHeading({ title, subline, sublineAction, actions, subRow }: Props) {
  return (
    <header className={styles.heading}>
      <div className={styles.top}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{title}</h1>
          {(subline || sublineAction) && (
            <div className={styles.sublineRow}>
              {subline && <p className={styles.subline}>{subline}</p>}
              {sublineAction && <div className={styles.sublineAction}>{sublineAction}</div>}
            </div>
          )}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {subRow && <div className={styles.subRow}>{subRow}</div>}
    </header>
  );
}
