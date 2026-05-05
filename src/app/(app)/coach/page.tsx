import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getPlanById } from "@/server/plans/queries";
import { getActivePlan } from "@/server/plans/date-queries";
import { loadHistory } from "@/server/coach/messages";
import { CoachContent } from "./coach-content";

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAN_FROM_RE = new RegExp(`^/plans/(${UUID_RE})$`);

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CoachPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;

  const params = await searchParams;
  const planIdParam = typeof params.plan_id === "string" ? params.plan_id : null;
  const from = typeof params.from === "string" ? params.from : null;
  const intent = typeof params.intent === "string" ? params.intent : null;
  const planFileId = typeof params.plan_file_id === "string" ? params.plan_file_id : null;
  const planId = planIdParam ?? (from ? (from.match(PLAN_FROM_RE)?.[1] ?? null) : null);

  // Coach chat is plan-anchored: every conversation belongs to a plan. If the
  // user lands on /coach with no plan context (and no in-flight build/import
  // intent), route them to their active plan or, if none exists, to the plans
  // list where they can build or import.
  if (!planId && !intent && !planFileId) {
    const active = await getActivePlan(userId);
    redirect(active ? `/coach?plan_id=${active.id}` : "/plans");
  }

  // Build form starts a fresh plan — never carry over prior conversation history.
  // Once the form is submitted, plan-created pivots the URL to plan_id=NEW and
  // the conversation lives under that plan from message 1.
  const isBuildIntent = intent === "build" && !planId;
  const [messages, plan] = await Promise.all([
    isBuildIntent ? Promise.resolve([]) : loadHistory(userId, planId),
    planId ? getPlanById(planId, userId) : Promise.resolve(null),
  ]);

  const queryClient = new QueryClient();
  const s = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["coach", "messages", planId], s(messages));
  if (planId && plan) {
    queryClient.setQueryData(["plans", planId], s(plan));
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CoachContent />
    </HydrationBoundary>
  );
}
