import { WorkoutBadge } from "@/components/workouts/WorkoutBadge";
import type { WorkoutRow } from "@/plans/dateQueries";
import type { TargetIntensity, IntervalSpec } from "@/db/schema";
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

function formatPace(secPerKm: number, u: "mi" | "km"): string {
  const sec = u === "mi" ? Math.round(secPerKm * 1.609344) : Math.round(secPerKm);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function fmtPaceRange(p: { min_seconds_per_km?: number; max_seconds_per_km?: number }, u: "mi" | "km"): string {
  const min = p.min_seconds_per_km != null ? formatPace(p.min_seconds_per_km, u) : "";
  const max = p.max_seconds_per_km != null ? formatPace(p.max_seconds_per_km, u) : "";
  return min && max ? `${min}–${max}` : min || max || "—";
}

export function HeroWorkout({ workout, units }: { workout: WorkoutRow; units: "mi" | "km" }) {
  const hasNotes = !!workout.notes;
  const t = hasNotes ? ({} as TargetIntensity) : ((workout.target_intensity ?? {}) as TargetIntensity);
  const intervals = hasNotes ? null : ((workout.intervals ?? null) as IntervalSpec[] | null);
  const pace = t.pace ? fmtPaceRange(t.pace, units) : null;

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
      {(t.hr || t.rpe != null || t.power) && (
        <div className={styles.intensityRow}>
          {t.hr && (
            <div className={styles.intensityCell}>
              <span className={styles.lbl}>HR</span>
              <span className={styles.val}>
                {"zone" in t.hr ? t.hr.zone : `${(t.hr as { min_bpm?: number }).min_bpm ?? ""}–${(t.hr as { max_bpm?: number }).max_bpm ?? ""}`}
              </span>
            </div>
          )}
          {t.rpe != null && (
            <div className={styles.intensityCell}>
              <span className={styles.lbl}>RPE</span>
              <span className={styles.val}>{t.rpe}/10</span>
            </div>
          )}
          {t.power && (
            <div className={styles.intensityCell}>
              <span className={styles.lbl}>Power</span>
              <span className={styles.val}>{`${t.power.min_watts ?? ""}–${t.power.max_watts ?? ""} W`}</span>
            </div>
          )}
        </div>
      )}
      {intervals && intervals.length > 0 && (
        <div className={styles.intervals}>
          <h3 className={styles.h3}>Intervals</h3>
          <ul className={styles.intervalList}>
            {intervals.map((iv, i) => (
              <li key={i} className={styles.intervalRow}>
                {iv.reps} ×{" "}
                {[
                  iv.distance_m != null
                    ? `${(iv.distance_m / (units === "mi" ? 1609.344 : 1000)).toFixed(2)} ${units}`
                    : null,
                  iv.duration_s != null ? fmtDur(iv.duration_s) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {iv.target_intensity?.pace
                  ? ` @ ${fmtPaceRange(iv.target_intensity.pace, units)}`
                  : null}
                {iv.rest?.duration_s != null ? ` / ${fmtDur(iv.rest.duration_s)} rest` : null}
                {iv.rest?.distance_m != null
                  ? ` / ${(iv.rest.distance_m / (units === "mi" ? 1609.344 : 1000)).toFixed(2)} ${units} rest`
                  : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {workout.notes && <p className={styles.description}>{workout.notes}</p>}
    </article>
  );
}
