import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { clearMessages, loadHistory } from "@/coach/messages";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const messages = await loadHistory(session.user.id);
  return NextResponse.json({ messages });
}

export async function DELETE(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearMessages(session.user.id);
  return new NextResponse(null, { status: 204 });
}
