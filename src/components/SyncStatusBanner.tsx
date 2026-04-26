"use client";

import { useEffect, useState } from "react";
import styles from "./SyncStatusBanner.module.scss";

interface Props {
  initialSynced: boolean;
}

export function SyncStatusBanner({ initialSynced }: Props) {
  const [synced, setSynced] = useState(initialSynced);

  useEffect(() => {
    if (synced) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/strava/sync-status");
        if (!res.ok) return;
        const data = (await res.json()) as { last_synced_at: string | null };
        if (data.last_synced_at) {
          setSynced(true);
          clearInterval(interval);
        }
      } catch {
        // ignore transient errors; next tick will retry
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [synced]);

  if (synced) return null;
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden />
      <span>Syncing your last 90 days from Strava…</span>
    </div>
  );
}
