import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, DEFAULT_PREFERENCES } from "@/server/db/schema";
import { requireUser } from "@/lib/api-auth";
import { PreferencesSchema } from "@/lib/preferences";

export async function GET(): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const [row] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);
  return NextResponse.json({ preferences: row?.preferences ?? DEFAULT_PREFERENCES });
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = PreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db.update(users).set({ preferences: parsed.data }).where(eq(users.id, auth.userId));
  return NextResponse.json({ ok: true });
}
