import { CSRSuspense } from "@/lib/csr-suspense";
import { PageHeader } from "@/components/layout/page-header";
import { UploadDropzone } from "@/components/plans/upload-dropzone";
import { PlansListSkeleton } from "@/components/skeletons/plans-list-skeleton";
import { PlansList } from "./plans-content";
import styles from "./plans.module.scss";

// A static shell: the data comes from React Query on the client, so switching
// to this tab never waits on the server.
export default function PlansPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Plans" />
      <UploadDropzone />
      <CSRSuspense fallback={<PlansListSkeleton />}>
        <PlansList />
      </CSRSuspense>
    </div>
  );
}
