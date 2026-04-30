import { Skeleton } from "./skeleton";
import styles from "./skeletons.module.scss";

export function HeroSkeleton() {
  return (
    <article className={styles.column}>
      <Skeleton width={60} height={22} borderRadius="var(--radius-pill)" />
      <Skeleton width="55%" height={52} borderRadius="var(--radius-sm)" />
      <div className={styles.row}>
        <Skeleton width={72} height={44} />
        <Skeleton width={72} height={44} />
      </div>
    </article>
  );
}
