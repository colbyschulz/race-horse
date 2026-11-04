import styles from "./tool-indicator.module.scss";

export function ToolIndicator({ label, summary }: { label: string; summary?: string }) {
  return (
    <div className={styles.row}>
      <span className={summary ? styles.dotDone : styles.dot} />
      <span className={styles.label}>{summary ?? label}</span>
    </div>
  );
}

/** A short note the coach wrote between steps, such as what it's checking next. */
export function ProgressNote({ text }: { text: string }) {
  return <p className={styles.note}>{text}</p>;
}
