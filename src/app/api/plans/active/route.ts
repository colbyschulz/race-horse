import { NextResponse } from "next/server";
import { getActivePlan } from "@/server/plans/date-queries";
import { requireUser } from "@/lib/api-auth";

export async function GET(): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const plan = await getActivePlan(auth.userId);
  return NextResponse.json({ plan });
}
