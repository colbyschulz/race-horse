// src/app/(app)/plans/upload/[id]/review/page.tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { plans, users } from "@/db/schema";
import { getPlanFileById } from "@/plans/files";
import { todayIso } from "@/lib/dates";
import { ReviewClient } from "./ReviewClient";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retry?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const { id } = await params;
  const { retry } = await searchParams;
  const isRetry = retry === "1";

  const file = await getPlanFileById(id, userId);
  if (!file) notFound();

  const [pref] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";

  const activeRows = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.is_active, true)))
    .limit(1);
  const hasActivePlan = activeRows.length > 0;

  return (
    <ReviewClient
      initialFile={{
        id: file.id,
        status: file.status,
        original_filename: file.original_filename,
        extraction_error: file.extraction_error,
        extracted_payload: file.extracted_payload,
      }}
      units={units}
      today={todayIso()}
      hasActivePlan={hasActivePlan}
      isRetry={isRetry}
    />
  );
}
