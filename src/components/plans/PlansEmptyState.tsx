import styles from "./PlansEmptyState.module.scss";

export function PlansEmptyState() {
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>No plans yet</h2>
      <p className={styles.body}>
        Once the coach is online or upload is wired up, your plans will live here.
      </p>
    </div>
  );
}
