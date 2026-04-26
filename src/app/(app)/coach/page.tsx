import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadHistory } from "@/coach/messages";
import { CoachPageClient } from "./CoachPageClient";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { from } = await searchParams;
  const messages = await loadHistory(session.user.id);
  return <CoachPageClient initialMessages={messages} fromRoute={from} />;
}
