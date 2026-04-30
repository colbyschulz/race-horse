"use client";
import { useEffect, useRef, useState } from "react";
import { weeklyMileage } from "@/plans/plan-stats";
import { mondayOf } from "@/lib/dates";
import type { WorkoutRow } from "@/plans/date-queries";
import styles from "./plan-detail.module.scss";

interface Props {
  workouts: WorkoutRow[];
  units: "mi" | "km";
  planStartDate: string;
}

function weekIndexFromMonday(planStart: string, monday: string): number {
  const startMon = mondayOf(planStart);
  const ms = new Date(monday + "T00:00:00").getTime() - new Date(startMon + "T00:00:00").getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export function MileageChart({ workouts, units, planStartDate }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState(0);

  const weeks = weeklyMileage(workouts, units);

  useEffect(() => {
    if (activeIdx == null) return;
    const bar = barRefs.current[activeIdx];
    const wrap = wrapRef.current;
    if (!bar || !wrap) return;
    const b = bar.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    setTooltipLeft(b.left - w.left + b.width / 2);
  }, [activeIdx]);

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setActiveIdx(null);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  if (weeks.length <= 1) return null;
  const max = Math.max(...weeks.map((w) => w.miles));
  const active = activeIdx != null ? weeks[activeIdx] : null;
  const activeWeekIdx = active ? weekIndexFromMonday(planStartDate, active.mondayIso) : null;

  return (
    <div
      ref={wrapRef}
      className={styles.chartWrap}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setActiveIdx(null);
      }}
    >
      <div
        className={`${styles.chartTooltip} ${active ? styles.chartTooltipVisible : ""}`}
        style={{ left: `${tooltipLeft}px` }}
        role="status"
        aria-live="polite"
      >
        {active && (
          <>
            <span className={styles.chartTooltipWeek}>Week {activeWeekIdx}</span>
            <span className={styles.chartTooltipValue}>
              {active.miles.toFixed(1)} {units}
            </span>
          </>
        )}
      </div>
      <div className={styles.chart}>
        {weeks.map((w, i) => {
          const ratio = max > 0 ? w.miles / max : 0;
          const heightPct = Math.max(8, Math.round(ratio * 100));
          const tint = Math.round(25 + ratio * 50);
          const isActive = i === activeIdx;
          const weekNum = weekIndexFromMonday(planStartDate, w.mondayIso);
          return (
            <button
              type="button"
              key={w.mondayIso}
              ref={(el) => {
                barRefs.current[i] = el;
              }}
              className={`${styles.chartBar} ${isActive ? styles.chartBarActive : ""}`}
              aria-label={`Week ${weekNum}: ${w.miles.toFixed(1)} ${units}`}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setActiveIdx(i);
              }}
              onClick={() => setActiveIdx(activeIdx === i ? null : i)}
              style={{
                height: `${heightPct}%`,
                background: `color-mix(in srgb, var(--color-brown) ${tint}%, var(--color-bg-subtle))`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
