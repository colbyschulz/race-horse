// src/app/api/plans/upload/[id]/file/route.ts
import { NextResponse } from "next/server";
import { getPlanFileById } from "@/server/plans/files";
import { requireUser } from "@/lib/api-auth";
import { notFound } from "@/lib/api-responses";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse | Response> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, user.userId);
  if (!row) return notFound();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const upstream = await fetch(row.blob_url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!upstream.ok) return NextResponse.json({ error: "blob unavailable" }, { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(row.original_filename)}"`,
    },
  });
}
