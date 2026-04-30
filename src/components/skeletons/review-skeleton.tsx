import { Skeleton } from "./skeleton";
import styles from "./skeletons.module.scss";

export function ReviewSkeleton() {
  return (
    <div className={styles.columnLoose}>
      <Skeleton height={88} borderRadius="var(--radius-lg)" />
      <Skeleton height={400} borderRadius="var(--radius-lg)" />
    </div>
  );
}
