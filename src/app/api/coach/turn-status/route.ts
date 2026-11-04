import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { closeStaleTurn, getTurnStatus } from "@/server/coach/turn-status";
import { isTurnStale, TURN_CUT_OFF_MESSAGE } from "@/lib/turn-poll";

function parsePlanId(req: NextRequest): string | null {
  const v = req.nextUrl.searchParams.get("plan_id");
  return v && v !== "null" ? v : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const planId = parsePlanId(req);
  const turn = await getTurnStatus(session.user.id, planId);
  // This response still reports the stale turn so the client can say so once;
  // closing the row keeps later visits from repeating it.
  if (turn && isTurnStale(turn.status, turn.started_at, Date.now())) {
    try {
      await closeStaleTurn(session.user.id, planId, turn.started_at, TURN_CUT_OFF_MESSAGE);
    } catch (err) {
      console.error("closing stale coach turn failed", err);
    }
  }
  return NextResponse.json({ turn });
}
