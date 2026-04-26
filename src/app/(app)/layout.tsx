import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncActivities } from "@/strava/sync";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { AppShell } from "@/components/layout/AppShell";
import { PreferencesCapture } from "@/components/PreferencesCapture";

const INITIAL_BACKFILL_DAYS = 90;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const userId = session.user.id;
  const rows = await db
    .select({
      last_synced_at: users.last_synced_at,
      preferences: users.preferences,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const userRow = rows[0];

  if (userRow && userRow.last_synced_at === null) {
    const startedAt = new Date();
    const sinceDate = new Date(
      Date.now() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000,
    );
    after(async () => {
      try {
        await syncActivities({ userId, sinceDate });
        await db
          .update(users)
          .set({ last_synced_at: startedAt })
          .where(eq(users.id, userId));
      } catch (err) {
        console.error("initial backfill failed", userId, err);
      }
    });
  }

  return (
    <>
      <PreferencesCapture preferences={userRow?.preferences} />
      <SyncStatusBanner initialSynced={!!userRow?.last_synced_at} />
      <AppShell>{children}</AppShell>
    </>
  );
}
