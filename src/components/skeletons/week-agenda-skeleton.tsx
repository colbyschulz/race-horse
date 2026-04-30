import { Skeleton } from "./skeleton";
import styles from "./skeletons.module.scss";

export function WeekAgendaSkeleton() {
  return (
    <div className={styles.columnLoose}>
      <div className={styles.rowBetween}>
        <Skeleton width={140} height={20} />
        <div className={styles.row}>
          <Skeleton width={32} height={32} borderRadius="var(--radius-md)" />
          <Skeleton width={32} height={32} borderRadius="var(--radius-md)" />
          <Skeleton width={56} height={32} borderRadius="var(--radius-md)" />
        </div>
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} height={52} borderRadius="var(--radius-md)" />
      ))}
    </div>
  );
}
