"use client";
import Link from "next/link";
import styles from "./Calendar.module.scss";

interface Props {
  weekLabel: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  isCurrentWeek: boolean;
}

export function CalendarClient({ weekLabel, prevHref, nextHref, todayHref, isCurrentWeek }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <h1 className={styles.weekLabel}>{weekLabel}</h1>
        {!isCurrentWeek && (
          <Link className={styles.todayBtn} href={todayHref}>Today</Link>
        )}
      </div>
      <div className={styles.nav}>
        <Link className={styles.navBtn} href={prevHref} aria-label="Previous week">← Prev week</Link>
        <Link className={styles.navBtn} href={nextHref} aria-label="Next week">Next week →</Link>
      </div>
    </header>
  );
}
