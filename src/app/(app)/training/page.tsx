import { CSRSuspense } from "@/lib/csr-suspense";
import { WeekAgendaSkeleton } from "@/components/skeletons/week-agenda-skeleton";
import { TrainingContent } from "./training-content";
import styles from "./training.module.scss";

// A static shell: the data comes from React Query on the client, so switching
// to this tab never waits on the server.
export default function TrainingPage() {
  return (
    <div className={styles.page}>
      <CSRSuspense fallback={<WeekAgendaSkeleton />}>
        <TrainingContent />
      </CSRSuspense>
    </div>
  );
}
