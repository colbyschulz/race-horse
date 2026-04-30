import { listPlansWithCounts } from "@/plans/queries";
import { listInFlightPlanFiles } from "@/plans/files";
import { PlansPageClient } from "./plans-page-client";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";

export async function PlansListSection({ userId, today }: { userId: string; today: string }) {
  const [plans, planFiles, prefRows] = await Promise.all([
    listPlansWithCounts(userId),
    listInFlightPlanFiles(userId),
    db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const units = (prefRows[0]?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";
  return <PlansPageClient plans={plans} today={today} planFiles={planFiles} units={units} />;
}
