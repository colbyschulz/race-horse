import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getPlanById } from "@/server/plans/queries";
import { getWorkoutsForPlan } from "@/server/plans/date-queries";
import type { Goal } from "@/server/db/schema";

type Ctx = { params: Promise<{ id: string }> };

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtMeters(m: string | number | null): string | null {
  if (m == null) return null;
  const mi = Number(m) / 1609.344;
  return `${mi.toFixed(1)} mi`;
}

function fmtSeconds(s: number | null): string | null {
  if (s == null) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse | Response> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const [plan, allWorkouts] = await Promise.all([
    getPlanById(id, auth.userId),
    getWorkoutsForPlan(id),
  ]);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const goal = plan.goal as Goal | null;
  const lines: string[] = [];

  lines.push(`# ${plan.title}`, "");
  lines.push(`Sport: ${plan.sport}`);
  lines.push(`Start: ${plan.start_date}`);
  if (plan.end_date) lines.push(`End: ${plan.end_date}`);
  if (goal) {
    const parts = [
      goal.race_distance,
      goal.race_date,
      goal.target_time ? `target ${goal.target_time}` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`Goal: ${parts.join(" — ")}`);
  }
  lines.push("", "---", "");

  const startMs = new Date(plan.start_date + "T00:00:00Z").getTime();
  let lastWeek = -1;

  for (const w of allWorkouts) {
    const weekNum = Math.floor(
      (new Date(w.date + "T00:00:00Z").getTime() - startMs) / (7 * 24 * 3600 * 1000)
    );
    if (weekNum !== lastWeek) {
      if (lastWeek >= 0) lines.push("");
      lines.push(`## Week ${weekNum + 1}`, "");
      lastWeek = weekNum;
    }

    const details = [w.type, fmtMeters(w.distance_meters), fmtSeconds(w.duration_seconds)]
      .filter(Boolean)
      .join(" — ");
    lines.push(`**${fmtDate(w.date)}** — ${details}`);
    if (w.notes) lines.push(w.notes);
    lines.push("");
  }

  const slug = plan.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `${slug}.md`;

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
