import styles from "./PlanActionRow.module.scss";

interface Props {
  onUpload?: () => void;
  uploadDisabled?: boolean;
}

export function PlanActionRow({ onUpload, uploadDisabled }: Props) {
  return (
    <div className={styles.row} aria-label="Plan actions">
      <a href="/coach?from=/plans" className={styles.btnPrimary}>
        <span className={styles.icon}>✦</span> Build with coach
      </a>
      <button
        type="button"
        disabled={uploadDisabled}
        className={styles.btnSecondary}
        onClick={onUpload}
      >
        <span className={styles.icon}>↑</span> Upload plan
      </button>
    </div>
  );
}
