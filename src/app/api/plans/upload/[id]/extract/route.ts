// src/app/api/plans/upload/[id]/extract/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { runExtraction } from "@/server/extraction/runtime";
import { getPlanFileById, updatePlanFileStatus } from "@/server/plans/files";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
function notFound() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, session.user.id);
  if (!row) return notFound();

  // ?reset=1 allows retrying a failed extraction
  const url = new URL(req.url);
  const reset = url.searchParams.get("reset") === "1";
  if (reset && row.status === "failed") {
    await updatePlanFileStatus(id, session.user.id, "extracting", null);
  } else if (row.status !== "extracting") {
    return NextResponse.json({ error: "not in extracting state" }, { status: 409 });
  }

  await runExtraction(id, session.user.id);

  const final = await getPlanFileById(id, session.user.id);
  if (!final) return notFound();
  return NextResponse.json({
    id: final.id,
    status: final.status,
    extraction_error: final.extraction_error,
  });
}
