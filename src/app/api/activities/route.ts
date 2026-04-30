import { NextResponse } from "next/server";
import { getActivitiesForDateRange } from "@/server/strava/date-queries";
import { requireUser } from "@/lib/api-auth";
import { isIsoDate } from "@/lib/dates";

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return NextResponse.json({ error: "from and to are required (YYYY-MM-DD)" }, { status: 400 });
  }
  const activities = await getActivitiesForDateRange(auth.userId, from, to);
  return NextResponse.json({ activities });
}
