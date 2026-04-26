import styles from "./PlanActionRow.module.scss";

export function PlanActionRow() {
  return (
    <>
      <div className={styles.row} aria-label="Plan actions">
        <button
          type="button"
          disabled
          className={styles.btnPrimary}
          title="Coming in Phase 4"
        >
          <span className={styles.icon}>✦</span> Build with coach
        </button>
        <button
          type="button"
          disabled
          className={styles.btnSecondary}
          title="Coming in Phase 6"
        >
          <span className={styles.icon}>↑</span> Upload plan
        </button>
      </div>
      <span className={styles.comingSoon}>
        Coach &amp; upload coming soon
      </span>
    </>
  );
}
