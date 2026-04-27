import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { auth } from "@/auth";
import { deletePlanFile, getPlanFileById } from "@/plans/files";

type Ctx = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
function notFound() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, session.user.id);
  if (!row) return notFound();
  return NextResponse.json({
    id: row.id,
    status: row.status,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    extraction_error: row.extraction_error,
    extracted_payload: row.extracted_payload,
    extracted_plan_id: row.extracted_plan_id,
    created_at: row.created_at,
  });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, session.user.id);
  if (!row) return notFound();

  try {
    await del(row.blob_url);
  } catch {
    /* swallow — keep going to delete the row */
  }
  await deletePlanFile(id, session.user.id);
  return new NextResponse(null, { status: 204 });
}
