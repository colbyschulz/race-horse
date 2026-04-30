import styles from "./tool-indicator.module.scss";

export function ToolIndicator({ name, summary }: { name: string; summary?: string }) {
  return (
    <div className={styles.row}>
      <span className={summary ? styles.dotDone : styles.dot} />
      <span className={styles.label}>{summary ?? `Calling ${name.replace(/_/g, " ")}…`}</span>
    </div>
  );
}
