import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { PlansListSection } from "./PlansListSection";
import { PlansListSkeleton } from "./PlansListSkeleton";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PlansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const today = isoToday();

  return (
    <Suspense fallback={<PlansListSkeleton />}>
      <PlansListSection userId={session.user.id} today={today} />
    </Suspense>
  );
}
