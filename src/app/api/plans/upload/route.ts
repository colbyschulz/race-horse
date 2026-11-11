// src/app/api/plans/upload/route.ts
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { createPlanFile } from "@/server/plans/files";
import { requireUser } from "@/lib/api-auth";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown",
  txt: "text/plain",
};

function extFromName(name: string): string | null {
  const i = name.lastIndexOf(".");
  if (i < 0) return null;
  return name.slice(i + 1).toLowerCase();
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 10 MB)" }, { status: 400 });
  }
  const ext = extFromName(file.name);
  if (!ext || !(ext in ALLOWED)) {
    return NextResponse.json({ error: "unsupported file type" }, { status: 400 });
  }
  const mime = ALLOWED[ext];

  const id = crypto.randomUUID();
  const blobPath = `plan-files/${id}/${file.name}`;
  let blobUrl: string;
  try {
    const blob = await put(blobPath, file, {
      access: "private",
      contentType: mime,
    });
    blobUrl = blob.url;
  } catch (err) {
    console.error("[upload] blob put failed:", err);
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }

  try {
    await createPlanFile({
      id,
      userId: user.userId,
      blob_url: blobUrl,
      original_filename: file.name,
      mime_type: mime,
      size_bytes: file.size,
    });
  } catch {
    // Best-effort blob cleanup
    try {
      await del(blobUrl);
    } catch {
      /* swallow */
    }
    return NextResponse.json({ error: "could not record upload" }, { status: 500 });
  }

  return NextResponse.json({ id }, { status: 201 });
}
