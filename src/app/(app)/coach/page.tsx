import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadHistory } from "@/coach/messages";
import { getPlanById } from "@/plans/queries";
import { CoachPageClient } from "./CoachPageClient";

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
    // Explicit plan_id (e.g. from Today/Training) — look up title for the pill
    const plan = await getPlanById(planId, userId);
    if (plan) fromLabel = fromLabel ?? plan.title;
  } else if (from) {
    // Derive plan_id from plan detail URL
    const planMatch = from.match(PLAN_FROM_RE);
    if (planMatch) {
      planId = planMatch[1];
      if (!fromLabel) {
        const plan = await getPlanById(planId, userId);
        if (plan) fromLabel = plan.title;
      }
    }
  }

  const messages = await loadHistory(userId, planId);
  return (
    <CoachPageClient
      initialMessages={messages}
      fromRoute={from}
      fromLabel={fromLabel}
      planId={planId}
      planFileId={plan_file_id}
      intent={intent}
    />
  );
}
