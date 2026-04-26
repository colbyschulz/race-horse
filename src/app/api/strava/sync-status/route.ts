import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select({ last_synced_at: users.last_synced_at })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return NextResponse.json({
    last_synced_at: rows[0]?.last_synced_at ?? null,
  });
}
