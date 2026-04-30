import { NextResponse } from "next/server";
import { getPlanById } from "@/server/plans/queries";
import { getWorkoutsForPlan } from "@/server/plans/date-queries";
import { requireUser } from "@/lib/api-auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const plan = await getPlanById(id, auth.userId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
  const workouts = await getWorkoutsForPlan(id);
  return NextResponse.json({ workouts });
}
