"use client";
import { useEffect } from "react";
import Link from "next/link";
import { WorkoutBadge } from "./workout-badge";
import { formatLongDate } from "@/lib/dates";
import type { WorkoutRow } from "@/types/plans";
import type { TargetIntensity, IntervalSpec } from "@/types/preferences";
import { Button } from "@/components/button/button";
import { formatDistance, formatDuration, formatPaceRange, metersToUnits } from "@/lib/format";
import { useBodyLock } from "@/lib/use-body-lock";
import styles from "./workout-detail-sheet.module.scss";

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

interface Props {
  workout: WorkoutRow | null;
  planId?: string;
  units: "mi" | "km";
  onClose: () => void;
}

export function WorkoutDetailSheet({ workout, planId = "", units, onClose }: Props) {
  const isOpen = !!workout;
  useBodyLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!workout) return null;

  const hasNotes = !!workout.notes;
  const t = hasNotes
    ? ({} as TargetIntensity)
    : ((workout.target_intensity ?? {}) as TargetIntensity);
  const intervals = hasNotes ? null : ((workout.intervals ?? null) as IntervalSpec[] | null);
  const headline = TYPE_HEADLINE[workout.type] ?? workout.type;
  const coachHref = `/coach?from=${encodeURIComponent(`/plans/${planId}`)}&from_label=${encodeURIComponent(`${headline} — ${workout.date}`)}`;
  const paceText = t.pace ? formatPaceRange(t.pace, units) : null;

  return (
    <>
      <div data-testid="sheet-backdrop" className={styles.backdrop} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${headline} on ${workout.date}`}
        className={styles.sheet}
      >
        <div className={styles.header}>
          <WorkoutBadge type={workout.type} />
          <h2 className={styles.headline}>{headline}</h2>
          <p className={styles.day}>{formatLongDate(workout.date)}</p>
        </div>

        <div className={styles.statRow}>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {formatDistance(workout.distance_meters as string | null, units) ?? "—"}
            </span>
            <span className={styles.statUnit}>{units}</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {formatDuration(workout.duration_seconds) ?? "—"}
            </span>
            <span className={styles.statUnit}>time</span>
          </div>
          {paceText && (
            <>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statValue}>{paceText}</span>
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
                  {"zone" in t.hr
                    ? t.hr.zone
                    : `${(t.hr as { min_bpm?: number }).min_bpm ?? ""}–${(t.hr as { max_bpm?: number }).max_bpm ?? ""}`}
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
                <span
                  className={styles.val}
                >{`${t.power.min_watts ?? ""}–${t.power.max_watts ?? ""} W`}</span>
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
                      ? `${metersToUnits(iv.distance_m, units).toFixed(2)} ${units}`
                      : null,
                    formatDuration(iv.duration_s),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {iv.target_intensity?.pace
                    ? ` @ ${formatPaceRange(iv.target_intensity.pace, units) ?? ""}`
                    : null}
                  {iv.rest?.duration_s != null
                    ? ` / ${formatDuration(iv.rest.duration_s) ?? ""} rest`
                    : null}
                  {iv.rest?.distance_m != null
                    ? ` / ${metersToUnits(iv.rest.distance_m, units).toFixed(2)} ${units} rest`
                    : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {workout.notes && <p className={styles.notes}>{workout.notes}</p>}

        <div className={styles.footer}>
          {planId && (
            <Link href={coachHref} className={styles.askCoach}>
              Ask coach about this workout →
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
