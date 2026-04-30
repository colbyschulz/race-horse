import { NextResponse } from "next/server";
import { listInFlightPlanFiles } from "@/server/plans/files";
import { requireUser } from "@/lib/api-auth";

export async function GET(): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const files = await listInFlightPlanFiles(auth.userId);
  return NextResponse.json({ files });
}
