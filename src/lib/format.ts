export type Units = "mi" | "km";

const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function metersToUnits(meters: number, units: Units): number {
  return units === "mi" ? meters / METERS_PER_MILE : meters / METERS_PER_KM;
}

export interface FormatDistanceOpts {
  decimals?: number;
  withUnit?: boolean;
}

export function formatDistance(
  meters: number | string | null | undefined,
  units: Units,
  opts: FormatDistanceOpts = {}
): string | null {
  if (meters == null) return null;
  const n = typeof meters === "string" ? Number(meters) : meters;
  if (!Number.isFinite(n)) return null;
  const value = metersToUnits(n, units).toFixed(opts.decimals ?? 1);
  return opts.withUnit ? `${value} ${units}` : value;
}

export interface FormatDurationOpts {
  format?: "compact" | "clock";
}

export function formatDuration(
  seconds: number | null | undefined,
  opts: FormatDurationOpts = {}
): string | null {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (opts.format === "clock") {
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  }
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatPace(secondsPerKm: number, units: Units): string {
  const sec = units === "mi" ? Math.round(secondsPerKm * 1.609344) : Math.round(secondsPerKm);
  return `${Math.floor(sec / 60)}:${pad2(sec % 60)}`;
}

export interface PaceRangeInput {
  min_seconds_per_km?: number;
  max_seconds_per_km?: number;
}

export function formatPaceRange(p: PaceRangeInput, units: Units): string | null {
  const min = p.min_seconds_per_km != null ? formatPace(p.min_seconds_per_km, units) : null;
  const max = p.max_seconds_per_km != null ? formatPace(p.max_seconds_per_km, units) : null;
  if (min && max) return `${min}–${max}`;
  return min || max || null;
}

export interface IntervalSummaryInput {
  reps: number;
  distance_m?: number;
  duration_s?: number;
  target_intensity?: { pace?: PaceRangeInput };
  rest?: { duration_s?: number; distance_m?: number };
}

export function formatIntervalSummary(
  intervals: IntervalSummaryInput[] | null | undefined,
  units: Units
): string | null {
  if (!intervals || intervals.length === 0) return null;
  const parts = intervals.map((iv) => {
    const measure =
      iv.distance_m != null
        ? `${metersToUnits(iv.distance_m, units).toFixed(2).replace(/\.?0+$/, "")} ${units}`
        : iv.duration_s != null
          ? (formatDuration(iv.duration_s) ?? "")
          : "";
    const pace =
      iv.target_intensity?.pace && formatPaceRange(iv.target_intensity.pace, units)
        ? ` @ ${formatPaceRange(iv.target_intensity.pace, units)}`
        : "";
    return `${iv.reps} × ${measure}${pace}`.trim();
  });
  return parts.join(" + ");
}
