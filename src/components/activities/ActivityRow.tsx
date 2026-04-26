import styles from "./ActivityRow.module.scss";
import type { ActivityRow as Activity } from "@/strava/dateQueries";

function fmtDistance(meters: number, units: "mi" | "km"): string {
  if (units === "mi") return (meters / 1609.344).toFixed(2);
  return (meters / 1000).toFixed(2);
}

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtPace(secPerKm: number, units: "mi" | "km"): string {
  const sec = units === "mi" ? Math.round(secPerKm * 1.609344) : Math.round(secPerKm);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ActivityRow({ activity, units }: { activity: Activity; units: "mi" | "km" }) {
  const meters = Number(activity.distance_meters ?? 0);
  const time = activity.moving_time_seconds ?? 0;
  const pace = activity.avg_pace_seconds_per_km != null ? Number(activity.avg_pace_seconds_per_km) : null;
  const power = activity.avg_power_watts != null ? Number(activity.avg_power_watts) : null;
  const hr = activity.avg_hr != null ? Number(activity.avg_hr) : null;
  const url = `https://www.strava.com/activities/${activity.strava_id}`;

  return (
    <a className={styles.row} href={url} target="_blank" rel="noopener noreferrer">
      <div className={styles.head}>
        <span className={styles.name}>{activity.name}</span>
        <span className={styles.kind}>{activity.type}</span>
      </div>
      <div className={styles.stats}>
        <span><strong>{fmtDistance(meters, units)}</strong> {units}</span>
        <span><strong>{fmtDuration(time)}</strong></span>
        {pace != null && <span><strong>{fmtPace(pace, units)}</strong> /{units}</span>}
        {power != null && <span><strong>{Math.round(power)}</strong> W</span>}
        {hr != null && <span><strong>{Math.round(hr)}</strong> bpm</span>}
      </div>
    </a>
  );
}
