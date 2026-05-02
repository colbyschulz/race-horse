import { PlansListSkeleton } from "@/components/skeletons/plans-list-skeleton";
import styles from "./plans.module.scss";

export default function PlansLoading() {
  return (
    <div className={styles.page}>
      <PlansListSkeleton />
    </div>
  );
}
