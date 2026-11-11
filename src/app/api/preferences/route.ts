import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { requireUser } from "@/lib/api-auth";
import { PreferencesSchema } from "@/lib/preferences";

// The session lookup already reads preferences, so this needs no query of its own.
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ preferences: session.user.preferences });
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
