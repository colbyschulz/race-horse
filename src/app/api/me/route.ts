import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { syncActivities } from "@/server/strava/sync";
import { requireUser } from "@/lib/api-auth";

const INITIAL_BACKFILL_DAYS = 90;

/**
 * Who is signed in, and whether their Strava history has been pulled yet. The
 * app shell calls this once it mounts, so it is also where a brand-new user's
 * first backfill gets kicked off.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const [row] = await db
    .select({ name: users.name, last_synced_at: users.last_synced_at })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (row && row.last_synced_at === null) {
    const startedAt = new Date();
    const sinceDate = new Date(startedAt.getTime() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
    // Write a sentinel immediately so repeated requests don't queue multiple syncs.
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

  return NextResponse.json({ name: row?.name ?? "", synced: !!row?.last_synced_at });
}
