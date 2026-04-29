"use client";
import Link from "next/link";
import styles from "./WeekNavigator.module.scss";

export interface NavTarget {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface Props {
  weekTitle: string;
  weekRange: string;
  prev: NavTarget;
  next: NavTarget;
  today?: NavTarget;
  showToday?: boolean;
  stickyTop?: number;
}

function NavBtn({
  target,
  ariaLabel,
  children,
  className,
}: {
  target: NavTarget;
  ariaLabel: string;
  children: React.ReactNode;
  className: string;
}) {
  if (target.href && !target.disabled) {
    return (
      <Link href={target.href} className={className} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      disabled={target.disabled}
      onClick={target.onClick}
    >
      {children}
    </button>
  );
}

export function WeekNavigator({
  weekTitle,
  weekRange,
  prev,
  next,
  today,
  showToday,
  stickyTop,
}: Props) {
  return (
    <div
      className={styles.nav}
      style={stickyTop !== undefined ? { position: "sticky", top: stickyTop } : undefined}
    >
      <div className={styles.left}>
        <NavBtn target={prev} ariaLabel="Previous week" className={styles.arrowBtn}>
          ←
        </NavBtn>
        <div className={styles.todaySlot}>
          {showToday && today && (
            <NavBtn target={today} ariaLabel="Jump to current week" className={styles.todayIcon}>
              Today
            </NavBtn>
          )}
        </div>
      </div>
      <div className={styles.center}>
        <span className={styles.title}>{weekTitle}</span>
        <span className={styles.range}>{weekRange}</span>
      </div>
      <div className={styles.right}>
        <NavBtn target={next} ariaLabel="Next week" className={styles.arrowBtn}>
          →
        </NavBtn>
      </div>
    </div>
  );
}
