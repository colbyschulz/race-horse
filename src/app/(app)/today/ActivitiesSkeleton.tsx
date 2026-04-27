import { Skeleton } from "@/components/skeletons/Skeleton";
import styles from "./Today.module.scss";

export function ActivitiesSkeleton() {
  return (
    <section className={styles.section}>
      <Skeleton width={120} height={11} />
      <div className={styles.activityList}>
        <Skeleton height={52} borderRadius="var(--radius-md)" />
        <Skeleton height={52} borderRadius="var(--radius-md)" />
      </div>
    </section>
  );
}
