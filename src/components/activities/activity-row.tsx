import styles from "./activity-row.module.scss";
import type { Activity } from "@/types/strava";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";

export function ActivityRow({ activity, units }: { activity: Activity; units: "mi" | "km" }) {
  const meters = Number(activity.distance_meters ?? 0);
  const time = activity.moving_time_seconds ?? 0;
  const pace =
    activity.avg_pace_seconds_per_km != null ? Number(activity.avg_pace_seconds_per_km) : null;
  const power = activity.avg_power_watts != null ? Number(activity.avg_power_watts) : null;
  const hr = activity.avg_hr != null ? Number(activity.avg_hr) : null;
  const url = `https://www.strava.com/activities/${activity.strava_id}`;

  return (
    <a className={styles.row} href={url} target="_blank" rel="noopener noreferrer">
      <div className={styles.head}>
        <span className={styles.nameWrap}>
          <svg
            className={styles.stravaIcon}
            viewBox="0 0 24 24"
            aria-label="View on Strava"
            role="img"
          >
            <path
              fill="#FC4C02"
              d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"
            />
          </svg>
          <span className={styles.name}>{activity.name}</span>
        </span>
        <span className={styles.kind}>{activity.type}</span>
      </div>
      <div className={styles.stats}>
        <span>
          <strong>{formatDistance(meters, units, { decimals: 2 })}</strong> {units}
        </span>
        <span>
          <strong>{formatDuration(time, { format: "clock" })}</strong>
        </span>
        {pace != null && (
          <span>
            <strong>{formatPace(pace, units)}</strong> /{units}
          </span>
        )}
        {power != null && (
          <span>
            <strong>{Math.round(power)}</strong> W
          </span>
        )}
        {hr != null && (
          <span>
            <strong>{Math.round(hr)}</strong> bpm
          </span>
        )}
      </div>
    </a>
  );
}
