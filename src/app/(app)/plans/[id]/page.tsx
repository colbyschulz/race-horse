import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getPlanById } from "@/server/plans/queries";
import { getWorkoutsForPlan } from "@/server/plans/date-queries";
import { PlanDetailContent } from "./plan-detail-content";
import styles from "./plan-detail.module.scss";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlanDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;

  const { id: planId } = await params;

  const [plan, allWorkouts] = await Promise.all([
    getPlanById(planId, userId),
    getWorkoutsForPlan(planId),
  ]);

  if (!plan) notFound();

  const queryClient = new QueryClient();
  const s = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["plans", planId], s(plan));
  queryClient.setQueryData(["plans", planId, "workouts"], s(allWorkouts));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className={styles.page}>
        <PlanDetailContent planId={planId} />
      </div>
    </HydrationBoundary>
  );
}
