import { HeroSkeleton } from "@/components/skeletons/hero-skeleton";
import styles from "./today.module.scss";

export default function TodayLoading() {
  return (
    <div className={styles.page}>
      <HeroSkeleton />
    </div>
  );
}
