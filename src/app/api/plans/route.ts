import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createPlan, listPlansWithCounts } from "@/plans/queries";
import type { CreatePlanInput, PlanMode, PlanSource, Sport } from "@/plans/types";

const VALID_SPORTS: Sport[] = ["run", "bike"];
const VALID_MODES: PlanMode[] = ["goal", "indefinite"];
const VALID_SOURCES: PlanSource[] = ["uploaded", "coach_generated"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const plans = await listPlansWithCounts(session.user.id);
  return NextResponse.json({ plans });
}

function validate(body: unknown): CreatePlanInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return null;
  if (typeof b.sport !== "string" || !VALID_SPORTS.includes(b.sport as Sport)) return null;
  if (typeof b.mode !== "string" || !VALID_MODES.includes(b.mode as PlanMode)) return null;
  if (typeof b.source !== "string" || !VALID_SOURCES.includes(b.source as PlanSource)) return null;
  if (typeof b.start_date !== "string" || !ISO_DATE.test(b.start_date)) return null;
  if (b.end_date != null && (typeof b.end_date !== "string" || !ISO_DATE.test(b.end_date)))
    return null;
  return {
    title: b.title.trim(),
    sport: b.sport as Sport,
    mode: b.mode as PlanMode,
    goal: (b.goal as CreatePlanInput["goal"]) ?? undefined,
    start_date: b.start_date,
    end_date: (b.end_date as string | null | undefined) ?? null,
    source: b.source as PlanSource,
    source_file_id: (b.source_file_id as string | null | undefined) ?? null,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const input = validate(body);
  if (!input) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const plan = await createPlan(session.user.id, input);
  return NextResponse.json({ plan }, { status: 201 });
}
