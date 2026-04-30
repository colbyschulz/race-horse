import { Skeleton } from "@/components/skeletons/skeleton";
import styles from "./today.module.scss";

export function HeroSkeleton() {
  return (
    <article className={styles.hero}>
      <Skeleton width={60} height={22} borderRadius="var(--radius-pill)" />
      <Skeleton width="55%" height={52} borderRadius="var(--radius-sm)" />
      <div style={{ display: "flex", gap: "var(--space-4)" }}>
        <Skeleton width={72} height={44} />
        <Skeleton width={72} height={44} />
      </div>
    </article>
  );
}
