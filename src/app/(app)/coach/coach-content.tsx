"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CoachPageClient } from "./coach-page-client";
import { useCoachMessages } from "@/queries/coach-messages";
import { usePlan } from "@/queries/plans";
import type { StoredMessage } from "@/types/coach";

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAN_FROM_RE = new RegExp(`^/plans/(${UUID_RE})$`);

export function CoachContent() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? undefined;
  const fromLabelParam = searchParams.get("from_label") ?? undefined;
  const planFileId = searchParams.get("plan_file_id") ?? undefined;
  const intent = searchParams.get("intent") ?? undefined;
  const planIdParam = searchParams.get("plan_id");

  const planId = useMemo<string | null>(() => {
    if (planIdParam) return planIdParam;
    if (from) {
      const match = from.match(PLAN_FROM_RE);
      if (match) return match[1];
    }
    return null;
  }, [planIdParam, from]);

  // Build form has no prior conversation — render the form directly with an
  // empty message list. Once the form is submitted, plan-created pivots us to
  // /coach?plan_id=NEW and the conversation lives under that plan.
  if (intent === "build" && !planId) {
    return (
      <CoachPageClient
        initialMessages={[]}
        fromRoute={from}
        fromLabel={fromLabelParam}
        planId={null}
        planFileId={planFileId}
        intent={intent}
      />
    );
  }

  return (
    <CoachWithMessages
      planId={planId}
      from={from}
      fromLabelParam={fromLabelParam}
      planFileId={planFileId}
      intent={intent}
    />
  );
}

interface WithMessagesProps {
  planId: string | null;
  from: string | undefined;
  fromLabelParam: string | undefined;
  planFileId: string | undefined;
  intent: string | undefined;
}

function CoachWithMessages({ planId, from, fromLabelParam, planFileId, intent }: WithMessagesProps) {
  const { data: messages } = useCoachMessages(planId);

  if (planId === null || fromLabelParam !== undefined) {
    return (
      <CoachPageClient
        initialMessages={messages}
        fromRoute={from}
        fromLabel={fromLabelParam}
        planId={planId}
        planFileId={planFileId}
        intent={intent}
      />
    );
  }

  return (
    <CoachWithPlanLabel
      planId={planId}
      messages={messages}
      from={from}
      planFileId={planFileId}
      intent={intent}
    />
  );
}

interface CoachWithPlanLabelProps {
  planId: string;
  messages: StoredMessage[];
  from: string | undefined;
  planFileId: string | undefined;
  intent: string | undefined;
}

function CoachWithPlanLabel({
  planId,
  messages,
  from,
  planFileId,
  intent,
}: CoachWithPlanLabelProps) {
  const { data: plan } = usePlan(planId);
  return (
    <CoachPageClient
      initialMessages={messages}
      fromRoute={from}
      fromLabel={plan?.title}
      planId={planId}
      planFileId={planFileId}
      intent={intent}
    />
  );
}
