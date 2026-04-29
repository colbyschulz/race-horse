import { Skeleton } from "@/components/skeletons/Skeleton";
import styles from "./Today.module.scss";

export function UpNextSkeleton() {
  return (
    <section className={styles.upNextSection}>
      <Skeleton width={60} height={11} />
      <ul className={styles.upNextList}>
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
