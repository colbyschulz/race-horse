import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { todayIso } from "@/lib/dates";
import { PlansListSection } from "./PlansListSection";
import { PlansListSkeleton } from "./PlansListSkeleton";

export default async function PlansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const today = todayIso();

  return (
    <Suspense fallback={<PlansListSkeleton />}>
      <PlansListSection userId={session.user.id} today={today} />
    </Suspense>
  );
}
