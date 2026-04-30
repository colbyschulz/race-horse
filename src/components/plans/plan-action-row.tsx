import Link from "next/link";
import styles from "./plan-action-row.module.scss";

interface Props {
  onUpload?: () => void;
  uploadDisabled?: boolean;
}

export function PlanActionRow({ onUpload, uploadDisabled }: Props) {
  return (
    <div className={styles.row} aria-label="Plan actions">
      <Link href="/coach?intent=build" className={styles.btnPrimary}>
        <span className={styles.icon}>✦</span> Build with coach
      </Link>
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
