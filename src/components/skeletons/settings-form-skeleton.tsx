import { Skeleton } from "./skeleton";
import styles from "./skeletons.module.scss";

export function SettingsFormSkeleton() {
  return (
    <div className={styles.columnSettings}>
      <Skeleton height={64} borderRadius="var(--radius-md)" />
      <Skeleton height={64} borderRadius="var(--radius-md)" />
      <Skeleton height={220} borderRadius="var(--radius-md)" />
    </div>
  );
}
