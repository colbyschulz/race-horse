import styles from "./ActivityRow.module.scss";
import type { ActivityRow as Activity } from "@/strava/dateQueries";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";

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
        <span><strong>{formatDistance(meters, units, { decimals: 2 })}</strong> {units}</span>
        <span><strong>{formatDuration(time, { format: "clock" })}</strong></span>
        {pace != null && <span><strong>{formatPace(pace, units)}</strong> /{units}</span>}
        {power != null && <span><strong>{Math.round(power)}</strong> W</span>}
        {hr != null && <span><strong>{Math.round(hr)}</strong> bpm</span>}
      </div>
    </a>
  );
}
