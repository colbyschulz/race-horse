import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { getPlanById } from "@/plans/queries";
import { MessagesSection } from "./MessagesSection";
import { MessagesSkeleton } from "./MessagesSkeleton";

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAN_FROM_RE = new RegExp(`^/plans/(${UUID_RE})$`);

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; from_label?: string; plan_file_id?: string; intent?: string; plan_id?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const { from, from_label, plan_file_id, intent, plan_id } = await searchParams;

  let fromLabel: string | undefined = from_label;
  let planId: string | null = plan_id ?? null;

  if (planId) {
    const plan = await getPlanById(planId, userId);
    if (plan) fromLabel = fromLabel ?? plan.title;
  } else if (from) {
    const planMatch = from.match(PLAN_FROM_RE);
    if (planMatch) {
      planId = planMatch[1];
      if (!fromLabel) {
        const plan = await getPlanById(planId, userId);
        if (plan) fromLabel = plan.title;
      }
    }
  }

  return (
    <Suspense fallback={<MessagesSkeleton />}>
      <MessagesSection
        userId={userId}
        planId={planId}
        fromRoute={from}
        fromLabel={fromLabel}
        planFileId={plan_file_id}
        intent={intent}
      />
    </Suspense>
  );
}
