import { NextResponse, type NextRequest } from "next/server";
import { clearMessages, loadHistory } from "@/server/coach/messages";
import { requireUser } from "@/lib/api-auth";

function parsePlanId(req: NextRequest): string | null {
  const v = req.nextUrl.searchParams.get("plan_id");
  return v && v !== "null" ? v : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const messages = await loadHistory(user.userId, parsePlanId(req));
  return NextResponse.json({ messages });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  await clearMessages(user.userId, parsePlanId(req));
  return new NextResponse(null, { status: 204 });
}
