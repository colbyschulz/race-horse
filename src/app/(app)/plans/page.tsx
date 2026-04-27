import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listPlansWithCounts } from "@/plans/queries";
import { listInFlightPlanFiles } from "@/plans/files";
import { PlansPageClient } from "./PlansPageClient";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PlansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const today = isoToday();
  const [plans, planFiles] = await Promise.all([
    listPlansWithCounts(session.user.id, today),
    listInFlightPlanFiles(session.user.id),
  ]);

  return <PlansPageClient plans={plans} today={today} planFiles={planFiles} />;
}
