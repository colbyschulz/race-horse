"use client";

import { useMe } from "@/queries/me";
import styles from "./app-shell.module.scss";

export function UserLabel() {
  const { data: me } = useMe();
  if (!me?.name) return null;
  return <div className={styles.userLabel}>{me.name}</div>;
}
