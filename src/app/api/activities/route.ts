import { NextResponse } from "next/server";
import { getActivitiesForDateRange } from "@/server/strava/date-queries";
import { isIsoDate } from "@/lib/dates";
import { requireUser } from "@/lib/api-auth";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!isIsoDate(from) || !isIsoDate(to)) {
    return NextResponse.json({ error: "from and to are required (YYYY-MM-DD)" }, { status: 400 });
  }

  // `from` and `to` are days on the athlete's calendar, not UTC days.
  const activities = await getActivitiesForDateRange(
    user.userId,
    from,
    to,
    user.preferences.timezone
  );
  return NextResponse.json({ activities });
}
