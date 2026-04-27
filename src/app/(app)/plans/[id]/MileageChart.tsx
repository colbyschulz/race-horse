"use client";
import { weeklyMileage } from "@/plans/planStats";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./PlanDetail.module.scss";

interface Props {
  workouts: WorkoutRow[];
  units: "mi" | "km";
}

export function MileageChart({ workouts, units }: Props) {
  const weeks = weeklyMileage(workouts, units);
  if (weeks.length <= 1) return null;
  const max = Math.max(...weeks.map((w) => w.miles));
  return (
    <div className={styles.chart} aria-hidden="true">
      {weeks.map((w) => {
        const ratio = max > 0 ? w.miles / max : 0;
        const heightPct = Math.max(8, Math.round(ratio * 100));
        const tint = Math.round(25 + ratio * 50);
        return (
          <a
            key={w.mondayIso}
            href={`#week-${w.mondayIso}`}
            className={styles.chartBar}
            title={`Week of ${w.mondayIso}: ${w.miles.toFixed(1)} ${units}`}
            style={{
              height: `${heightPct}%`,
              background: `color-mix(in srgb, var(--color-brown) ${tint}%, var(--color-bg-subtle))`,
            }}
          />
        );
      })}
    </div>
  );
}
