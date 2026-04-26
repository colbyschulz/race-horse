import styles from "./ToolIndicator.module.scss";

export function ToolIndicator({ name, summary }: { name: string; summary?: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.dot} />
      <span className={styles.label}>
        {summary ?? `Calling ${name.replace(/_/g, " ")}…`}
      </span>
    </div>
  );
}
