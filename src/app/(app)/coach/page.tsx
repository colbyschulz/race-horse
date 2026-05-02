import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getPlanById } from "@/server/plans/queries";
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
  const planId = planIdParam ?? (from ? (from.match(PLAN_FROM_RE)?.[1] ?? null) : null);

  const [messages, plan] = await Promise.all([
    loadHistory(userId, planId),
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
