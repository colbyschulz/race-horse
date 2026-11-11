import { NextResponse } from "next/server";
import { getActivitiesForDateRange } from "@/server/strava/date-queries";
import { auth } from "@/server/auth";
import { isIsoDate } from "@/lib/dates";

export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!isIsoDate(from) || !isIsoDate(to)) {
    return NextResponse.json({ error: "from and to are required (YYYY-MM-DD)" }, { status: 400 });
  }

  // `from` and `to` are days on the athlete's calendar, not UTC days.
  const activities = await getActivitiesForDateRange(
    session.user.id,
    from,
    to,
    session.user.preferences.timezone
  );
  return NextResponse.json({ activities });
}
