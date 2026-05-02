import { WeekAgendaSkeleton } from "@/components/skeletons/week-agenda-skeleton";
import styles from "./training.module.scss";

export default function TrainingLoading() {
  return (
    <div className={styles.page}>
      <WeekAgendaSkeleton />
    </div>
  );
}
