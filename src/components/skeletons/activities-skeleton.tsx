import { Skeleton } from "./skeleton";
import styles from "./skeletons.module.scss";

export function ActivitiesSkeleton() {
  return (
    <section className={styles.section}>
      <Skeleton width={120} height={11} />
      <div className={styles.list}>
        <Skeleton height={52} borderRadius="var(--radius-md)" />
        <Skeleton height={52} borderRadius="var(--radius-md)" />
      </div>
    </section>
  );
}
