import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { listPlansWithCounts } from "@/server/plans/queries";
import { listInFlightPlanFiles } from "@/server/plans/files";
import { PageHeader } from "@/components/layout/page-header";
import { UploadDropzone } from "@/components/plans/upload-dropzone";
import { PlansListSkeleton } from "@/components/skeletons/plans-list-skeleton";
import { PlansList } from "./plans-content";
import styles from "./plans.module.scss";

export default async function PlansPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;

  const [plans, planFiles] = await Promise.all([
    listPlansWithCounts(userId),
    listInFlightPlanFiles(userId),
  ]);

  const queryClient = new QueryClient();
  const s = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["plans", "list"], s(plans));
  queryClient.setQueryData(["plans", "files"], s(planFiles));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className={styles.page}>
        <PageHeader title="Plans" />
        <UploadDropzone />
        <Suspense fallback={<PlansListSkeleton />}>
          <PlansList />
        </Suspense>
      </div>
    </HydrationBoundary>
  );
}
