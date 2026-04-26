import { WorkoutBadge } from "@/components/workouts/WorkoutBadge";
import type { WorkoutRow } from "@/plans/dateQueries";
import type { TargetIntensity } from "@/db/schema";
import styles from "./Today.module.scss";

const TYPE_HEADLINE: Record<string, string> = {
  easy: "Easy Run",
  long: "Long Run",
  tempo: "Tempo Run",
  threshold: "Threshold",
  intervals: "Intervals",
  recovery: "Recovery",
  race: "Race Day",
  rest: "Rest",
  cross: "Cross Train",
};

function fmtDist(meters: string | null | undefined, units: "mi" | "km"): string {
  if (meters == null) return "—";
  return (Number(meters) / (units === "mi" ? 1609.344 : 1000)).toFixed(1);
}

function fmtDur(s: number | null | undefined): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function HeroWorkout({ workout, units }: { workout: WorkoutRow; units: "mi" | "km" }) {
  const t = (workout.target_intensity ?? {}) as TargetIntensity;
  const pace = t.pace ? `${t.pace.min_seconds_per_km != null ? formatPace(t.pace.min_seconds_per_km, units) : ""}${t.pace.max_seconds_per_km != null ? `–${formatPace(t.pace.max_seconds_per_km, units)}` : ""}` : null;

  function formatPace(secPerKm: number, u: "mi" | "km"): string {
    const sec = u === "mi" ? Math.round(secPerKm * 1.609344) : Math.round(secPerKm);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  }

  return (
    <article className={styles.hero}>
      <div className={styles.heroHead}>
        <WorkoutBadge type={workout.type} />
      </div>
      <h2 className={styles.headline}>{TYPE_HEADLINE[workout.type] ?? workout.type}</h2>
      <div className={styles.statRow}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{fmtDist(workout.distance_meters as string | null, units)}</span>
          <span className={styles.statUnit}>{units}</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statValue}>{fmtDur(workout.duration_seconds)}</span>
          <span className={styles.statUnit}>time</span>
        </div>
        {pace && (
          <>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statValue}>{pace}</span>
              <span className={styles.statUnit}>/{units}</span>
            </div>
          </>
        )}
      </div>
      {(t.pace || t.hr || t.rpe != null) && (
        <div className={styles.intensityRow}>
          {t.pace && (
            <div className={styles.intensityCell}>
              <span className={styles.lbl}>Pace</span>
              <span className={styles.val}>{pace ?? "—"}</span>
            </div>
          )}
          {t.hr && (
            <div className={styles.intensityCell}>
              <span className={styles.lbl}>HR</span>
              <span className={styles.val}>
                {"zone" in t.hr ? t.hr.zone : `${t.hr.min_bpm ?? ""}–${t.hr.max_bpm ?? ""}`}
              </span>
            </div>
          )}
          {t.rpe != null && (
            <div className={styles.intensityCell}>
              <span className={styles.lbl}>RPE</span>
              <span className={styles.val}>{t.rpe}/10</span>
            </div>
          )}
        </div>
      )}
      {workout.notes && <p className={styles.description}>{workout.notes}</p>}
    </article>
  );
}
