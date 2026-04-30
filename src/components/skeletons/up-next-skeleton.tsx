import { Skeleton } from "./skeleton";
import styles from "./skeletons.module.scss";

export function UpNextSkeleton() {
  return (
    <section className={styles.upNextSection}>
      <Skeleton width={60} height={11} />
      <ul className={styles.list}>
        <li>
          <Skeleton height={56} borderRadius="var(--radius-md)" />
        </li>
        <li>
          <Skeleton height={56} borderRadius="var(--radius-md)" />
        </li>
      </ul>
    </section>
  );
}
