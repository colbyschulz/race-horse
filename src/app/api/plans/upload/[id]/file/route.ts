// src/app/api/plans/upload/[id]/file/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPlanFileById } from "@/plans/files";

type Ctx = { params: Promise<{ id: string }> };

function unauthorized() { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
function notFound() { return NextResponse.json({ error: "not found" }, { status: 404 }); }

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse | Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, session.user.id);
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
