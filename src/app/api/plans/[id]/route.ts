import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  archivePlan,
  deletePlan,
  getPlanById,
  setActivePlan,
} from "@/plans/queries";

type Ctx = { params: Promise<{ id: string }> };

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
function notFound(): NextResponse {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const plan = await getPlanById(id, session.user.id);
  if (!plan) return notFound();
  return NextResponse.json({ plan });
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const owned = await getPlanById(id, session.user.id);
  if (!owned) return notFound();

  let body: { is_active?: boolean };
  try {
    body = (await req.json()) as { is_active?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "is_active is required" }, { status: 400 });
  }

  if (body.is_active) {
    await setActivePlan(id, session.user.id);
  } else {
    await archivePlan(id, session.user.id);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse | Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const owned = await getPlanById(id, session.user.id);
  if (!owned) return notFound();
  await deletePlan(id, session.user.id);
  return new NextResponse(null, { status: 204 });
}
