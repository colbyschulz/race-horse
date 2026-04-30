import { Skeleton } from "./skeleton";
import styles from "./skeletons.module.scss";

export function MessagesSkeleton() {
  return (
    <div className={styles.messages}>
      <div className={styles.messageOut}>
        <Skeleton width="60%" height={44} borderRadius="var(--radius-lg)" />
      </div>
      <div className={styles.messageIn}>
        <Skeleton width="75%" height={72} borderRadius="var(--radius-lg)" />
      </div>
      <div className={styles.messageOut}>
        <Skeleton width="45%" height={44} borderRadius="var(--radius-lg)" />
      </div>
      <div className={styles.messageIn}>
        <Skeleton width="70%" height={56} borderRadius="var(--radius-lg)" />
      </div>
    </div>
  );
}
