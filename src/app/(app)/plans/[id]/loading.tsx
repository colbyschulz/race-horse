import { WeekAgendaSkeleton } from "@/components/skeletons/week-agenda-skeleton";
import styles from "./plan-detail.module.scss";

export default function PlanDetailLoading() {
  return (
    <div className={styles.page}>
      <WeekAgendaSkeleton />
    </div>
  );
}
