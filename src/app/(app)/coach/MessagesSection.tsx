import { loadHistory } from "@/coach/messages";
import { CoachPageClient } from "./CoachPageClient";

interface Props {
  userId: string;
  planId: string | null;
  fromRoute: string | undefined;
  fromLabel: string | undefined;
  planFileId: string | undefined;
  intent: string | undefined;
}

export async function MessagesSection({
  userId,
  planId,
  fromRoute,
  fromLabel,
  planFileId,
  intent,
}: Props) {
  const messages = await loadHistory(userId, planId);
  return (
    <CoachPageClient
      initialMessages={messages}
      fromRoute={fromRoute}
      fromLabel={fromLabel}
      planId={planId}
      planFileId={planFileId}
      intent={intent}
    />
  );
}
