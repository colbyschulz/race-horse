"use client";

import { useMe } from "@/queries/me";
import { Spinner } from "../spinner/spinner";
import styles from "./sync-status-banner.module.scss";

export function SyncStatusBanner() {
  const { data: me } = useMe();
  if (!me || me.synced) return null;
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <Spinner size="sm" />
      <span>Syncing your last 90 days from Strava…</span>
    </div>
  );
}
