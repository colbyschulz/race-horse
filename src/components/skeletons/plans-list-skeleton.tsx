import { Skeleton } from "./skeleton";
import styles from "./skeletons.module.scss";

export function PlansListSkeleton() {
  return (
    <div className={styles.column}>
      <Skeleton height={88} borderRadius="var(--radius-lg)" />
      <Skeleton height={88} borderRadius="var(--radius-lg)" />
      <Skeleton height={88} borderRadius="var(--radius-lg)" />
    </div>
  );
}
