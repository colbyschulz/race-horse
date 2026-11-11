// src/app/api/plans/upload/[id]/extract/route.ts
import { NextResponse } from "next/server";
import { runExtraction } from "@/server/extraction/runtime";
import { getPlanFileById, updatePlanFileStatus } from "@/server/plans/files";
import { requireUser } from "@/lib/api-auth";
import { notFound } from "@/lib/api-responses";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, user.userId);
  if (!row) return notFound();

  // ?reset=1 allows retrying a failed extraction
  const url = new URL(req.url);
  const reset = url.searchParams.get("reset") === "1";
  if (reset && row.status === "failed") {
    await updatePlanFileStatus(id, user.userId, "extracting", null);
  } else if (row.status !== "extracting") {
    return NextResponse.json({ error: "not in extracting state" }, { status: 409 });
  }

  await runExtraction(id, user.userId);

  const final = await getPlanFileById(id, user.userId);
  if (!final) return notFound();
  return NextResponse.json({
    id: final.id,
    status: final.status,
    extraction_error: final.extraction_error,
  });
}
