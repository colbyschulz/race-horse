import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { deletePlanFile, getPlanFileById } from "@/server/plans/files";
import { requireUser } from "@/lib/api-auth";
import { notFound } from "@/lib/api-responses";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, user.userId);
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
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, user.userId);
  if (!row) return notFound();

  try {
    await del(row.blob_url);
  } catch {
    /* swallow — keep going to delete the row */
  }
  await deletePlanFile(id, user.userId);
  return new NextResponse(null, { status: 204 });
}
