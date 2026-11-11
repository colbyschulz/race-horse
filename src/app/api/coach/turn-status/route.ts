import { NextResponse, type NextRequest } from "next/server";
import { closeStaleTurn, getTurnStatus } from "@/server/coach/turn-status";
import { isTurnStale, TURN_CUT_OFF_MESSAGE } from "@/lib/turn-poll";
import { requireUser } from "@/lib/api-auth";

function parsePlanId(req: NextRequest): string | null {
  const v = req.nextUrl.searchParams.get("plan_id");
  return v && v !== "null" ? v : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const planId = parsePlanId(req);
  const turn = await getTurnStatus(user.userId, planId);
  // This response still reports the stale turn so the client can say so once;
  // closing the row keeps later visits from repeating it.
  if (turn && isTurnStale(turn.status, turn.started_at, Date.now())) {
    try {
      await closeStaleTurn(user.userId, planId, turn.started_at, TURN_CUT_OFF_MESSAGE);
    } catch (err) {
      console.error("closing stale coach turn failed", err);
    }
  }
  return NextResponse.json({ turn });
}
