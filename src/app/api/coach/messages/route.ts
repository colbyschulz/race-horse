import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { clearMessages, loadHistory } from "@/coach/messages";

function parsePlanId(req: NextRequest): string | null {
  const v = req.nextUrl.searchParams.get("plan_id");
  return v && v !== "null" ? v : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const messages = await loadHistory(session.user.id, parsePlanId(req));
  return NextResponse.json({ messages });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearMessages(session.user.id, parsePlanId(req));
  return new NextResponse(null, { status: 204 });
}
