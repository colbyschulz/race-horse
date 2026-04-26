import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db.select({ coach_notes: users.coach_notes })
    .from(users).where(eq(users.id, session.user.id)).limit(1);
  return NextResponse.json({ content: rows[0]?.coach_notes ?? "" });
}

export async function PUT(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { content?: string };
  try { body = (await req.json()) as { content?: string }; }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (typeof body.content !== "string") return NextResponse.json({ error: "content required" }, { status: 400 });
  if (body.content.length > 4096) return NextResponse.json({ error: "content exceeds 4096 chars" }, { status: 400 });
  await db.update(users).set({ coach_notes: body.content }).where(eq(users.id, session.user.id));
  return NextResponse.json({ ok: true });
}
