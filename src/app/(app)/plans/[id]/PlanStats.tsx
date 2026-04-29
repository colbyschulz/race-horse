import { computePlanStats } from "@/plans/planStats";
import { computeWeeksLeft } from "@/plans/stats";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./PlanDetail.module.scss";

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function calendarWeeks(startIso: string, endIso: string | null): number {
  const start = new Date(startIso + "T00:00:00");
  const end = endIso ? new Date(endIso + "T00:00:00") : new Date();
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

interface Props {
  workouts: WorkoutRow[];
  units: "mi" | "km";
  planStartDate: string;
  planEndDate: string | null;
  today: string;
}

export function PlanStats({ workouts, units, planStartDate, planEndDate, today }: Props) {
  const s = computePlanStats(workouts, units);
  const weeks = calendarWeeks(planStartDate, planEndDate);
  const weeksLeft = computeWeeksLeft(planEndDate, today);
  return (
    <section className={styles.statsCard}>
      <Stat label="Weeks" value={String(weeks)} />
      {weeksLeft != null && <Stat label="Left" value={String(weeksLeft)} />}
      <Stat
        label="Peak week"
        value={s.peakWeek ? s.peakWeek.distance.toFixed(1) : "—"}
        unit={s.peakWeek ? units : undefined}
        sub={s.peakWeek ? fmtDate(s.peakWeek.mondayIso) : undefined}
      />
      <Stat
        label="Longest run"
        value={s.longestRun ? s.longestRun.distance.toFixed(1) : "—"}
        unit={s.longestRun ? units : undefined}
        sub={s.longestRun ? fmtDate(s.longestRun.dateIso) : undefined}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className={styles.statBlock}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>
        {value}
        {unit && <span className={styles.statUnit}>{unit}</span>}
      </span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}
