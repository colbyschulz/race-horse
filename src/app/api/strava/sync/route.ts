import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncActivities } from "@/strava/sync";

const MANUAL_WINDOW_DAYS = 7;

export async function POST(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const sinceDate = new Date(
    Date.now() - MANUAL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const startedAt = new Date();

  after(async () => {
    try {
      const r = await syncActivities({ userId, sinceDate });
      await db
        .update(users)
        .set({ last_synced_at: startedAt })
        .where(eq(users.id, userId));
      console.log("manual sync done", { userId, ...r });
    } catch (err) {
      console.error("manual sync failed", userId, err);
    }
  });

  return NextResponse.json(
    { ok: true, scheduled: true, mode: "manual" },
    { status: 202 },
  );
}
