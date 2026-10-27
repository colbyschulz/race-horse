import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getTurnStatus } from "@/server/coach/turn-status";

function parsePlanId(req: NextRequest): string | null {
  const v = req.nextUrl.searchParams.get("plan_id");
  return v && v !== "null" ? v : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const turn = await getTurnStatus(session.user.id, parsePlanId(req));
  return NextResponse.json({ turn });
}
