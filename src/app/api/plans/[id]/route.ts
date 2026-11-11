import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { archivePlan, deletePlan, getPlanById, setActivePlan } from "@/server/plans/queries";
import { deletePlanFilesByPlanId } from "@/server/plans/files";
import { requireUser } from "@/lib/api-auth";
import { notFound } from "@/lib/api-responses";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  const plan = await getPlanById(id, user.userId);
  if (!plan) return notFound();
  return NextResponse.json({ plan });
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  const owned = await getPlanById(id, user.userId);
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
    await setActivePlan(id, user.userId);
  } else {
    await archivePlan(id, user.userId);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse | Response> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  const owned = await getPlanById(id, user.userId);
  if (!owned) return notFound();

  // Delete associated plan_files first (before the FK set-null fires)
  const deletedFiles = await deletePlanFilesByPlanId(id, user.userId);
  await Promise.allSettled(deletedFiles.map((f) => del(f.blob_url)));

  await deletePlan(id, user.userId);
  return new NextResponse(null, { status: 204 });
}
