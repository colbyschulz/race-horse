import { listPlansWithCounts } from "@/plans/queries";
import { listInFlightPlanFiles } from "@/plans/files";
import { PlansPageClient } from "./PlansPageClient";

export async function PlansListSection({
  userId,
  today,
}: {
  userId: string;
  today: string;
}) {
  const [plans, planFiles] = await Promise.all([
    listPlansWithCounts(userId, today),
    listInFlightPlanFiles(userId),
  ]);
  return <PlansPageClient plans={plans} today={today} planFiles={planFiles} />;
}
