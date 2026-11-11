import { CSRSuspense } from "@/lib/csr-suspense";
import { HeroSkeleton } from "@/components/skeletons/hero-skeleton";
import { TodayContent } from "./today-content";
import styles from "./today.module.scss";

// A static shell: the data comes from React Query on the client, so switching
// to this tab never waits on the server.
export default function TodayPage() {
  return (
    <div className={styles.page}>
      <CSRSuspense fallback={<HeroSkeleton />}>
        <TodayContent />
      </CSRSuspense>
    </div>
  );
}
