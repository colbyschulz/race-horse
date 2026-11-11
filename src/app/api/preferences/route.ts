import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { PreferencesSchema } from "@/lib/preferences";
import { requireUser } from "@/lib/api-auth";

// The session lookup already reads preferences, so this needs no query of its own.
export async function GET(): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ preferences: user.preferences });
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
