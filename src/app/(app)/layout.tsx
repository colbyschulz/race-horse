import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { syncActivities } from "@/server/strava/sync";
import { SyncStatusBanner } from "@/components/sync-status-banner/sync-status-banner";
import { AppShell } from "@/components/layout/app-shell";
import { PreferencesCapture } from "@/components/preferences-capture";
import { QueryProvider } from "@/lib/query-client";

const INITIAL_BACKFILL_DAYS = 90;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const userId = session.user.id;
  const [row] = await db
    .select({ last_synced_at: users.last_synced_at })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (row && row.last_synced_at === null) {
    const startedAt = new Date();
    const sinceDate = new Date(Date.now() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
    // Write a sentinel immediately so repeated page loads don't queue multiple syncs.
    await db.update(users).set({ last_synced_at: startedAt }).where(eq(users.id, userId));
    after(async () => {
      try {
        await syncActivities({ userId, sinceDate });
        await db.update(users).set({ last_synced_at: new Date() }).where(eq(users.id, userId));
      } catch (err) {
        console.error("initial backfill failed", userId, err);
      }
    });
  }

  return (
    <QueryProvider>
      <PreferencesCapture />
      <SyncStatusBanner initialSynced={!!row?.last_synced_at} />
      <AppShell>{children}</AppShell>
    </QueryProvider>
  );
}
