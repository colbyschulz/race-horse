import { NextResponse } from "next/server";
import { getWorkoutsForDateRange, getNextWorkouts } from "@/server/plans/date-queries";
import { requireUser } from "@/lib/api-auth";
import { isIsoDate } from "@/lib/dates";

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const after = url.searchParams.get("after");
  const limitStr = url.searchParams.get("limit");

  if (after && isIsoDate(after)) {
    const limit = limitStr ? Math.min(50, Math.max(1, parseInt(limitStr, 10) || 1)) : 1;
    const workouts = await getNextWorkouts(auth.userId, after, limit);
    return NextResponse.json({ workouts });
  }

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return NextResponse.json({ error: "from and to are required (YYYY-MM-DD)" }, { status: 400 });
  }
  const workouts = await getWorkoutsForDateRange(auth.userId, from, to);
  return NextResponse.json({ workouts });
}
