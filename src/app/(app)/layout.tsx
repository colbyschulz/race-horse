import { Suspense } from "react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getSession } from "@/lib/get-session";
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
  // The session check is the only thing that holds back the first byte. It
  // stays ahead of the stream so a dead session gets a real HTTP redirect,
  // which the service worker relies on to tell the app from the sign-in page.
  const session = await getSession();
  if (!session?.user?.id) redirect("/session-expired");

  return (
    <QueryProvider>
      <PreferencesCapture />
      <Suspense fallback={null}>
        <InitialSync userId={session.user.id} />
      </Suspense>
      <AppShell userName={session.user.name ?? ""}>{children}</AppShell>
    </QueryProvider>
  );
}

// Streams in after the shell: only a brand-new user ever sees the banner, so
// the sync lookup shouldn't hold up everyone's first paint.
async function InitialSync({ userId }: { userId: string }) {
  return <SyncStatusBanner initialSynced={await startInitialSyncIfNeeded(userId)} />;
}

/** Kicks off the first Strava backfill for a new user. Resolves to whether a sync has already run. */
async function startInitialSyncIfNeeded(userId: string): Promise<boolean> {
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

  return !!row?.last_synced_at;
}
