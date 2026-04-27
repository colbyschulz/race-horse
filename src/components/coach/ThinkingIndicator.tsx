import styles from "./ThinkingIndicator.module.scss";

export function ThinkingIndicator() {
  return (
    <div className={styles.row} aria-label="Coach is thinking">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </div>
  );
}
