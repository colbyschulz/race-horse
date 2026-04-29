import type { StravaPreload } from "./stravaPreload";

type ActivePlanSummary = {
  title: string;
  weeks_left: number | null;
  workout_count: number;
  completed: number;
};

type PlanFileSummary = {
  id: string;
  original_filename: string;
  status: "extracting" | "extracted" | "failed";
  extraction_error: string | null;
};

const ROUTE_LABELS: Record<string, string> = {
  "/today": "Today view",
  "/training": "Training view (week agenda)",
  "/plans": "Plans / manage page",
  "/settings": "Settings page",
  "/coach": "Coach chat",
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAN_DETAIL_RE = new RegExp(`^/plans/(${UUID})$`);
const WORKOUT_DETAIL_RE = new RegExp(`^/plans/(${UUID})/(\\d{4}-\\d{2}-\\d{2})$`);

export function routeLabel(from: string | undefined | null): string | null {
  if (!from) return null;
  const wmatch = from.match(WORKOUT_DETAIL_RE);
  if (wmatch) {
    return `Workout detail (plan id: ${wmatch[1]}, date: ${wmatch[2]})`;
  }
  const pmatch = from.match(PLAN_DETAIL_RE);
  if (pmatch) {
    return `Plan detail (plan id: ${pmatch[1]})`;
  }
  return ROUTE_LABELS[from] ?? null;
}

export function renderContextPrefix(params: {
  today: string;
  units: "mi" | "km";
  activePlan: ActivePlanSummary | null;
  coachNotes: string;
  planCoachNotes?: string;
  fromLabel: string | null;
  planFile?: PlanFileSummary | null;
  stravaPreload?: StravaPreload | null;
  coldStartBuild?: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`<context>`);
  const dayName = new Date(`${params.today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
  });
  lines.push(`Today: ${params.today} (${dayName})`);
  lines.push(`User units: ${params.units}`);
  if (params.activePlan && !params.coldStartBuild) {
    const a = params.activePlan;
    const wks = a.weeks_left == null ? "indefinite" : `${a.weeks_left} weeks left`;
    lines.push(
      `Active plan: ${a.title} — ${wks}, ${a.completed} / ${a.workout_count} workouts done`
    );
  }
  if (params.coachNotes.trim()) {
    lines.push(``);
    lines.push(`General coach notes:`);
    lines.push(params.coachNotes.trim());
  }
  if (params.planCoachNotes?.trim()) {
    lines.push(``);
    lines.push(`Plan notes (this plan only):`);
    lines.push(params.planCoachNotes.trim());
  }
  if (params.fromLabel) {
    lines.push(``);
    lines.push(`User opened coach from: ${params.fromLabel}`);
  }
  if (params.planFile) {
    lines.push(``);
    lines.push(`The user wants help with an unprocessed plan file.`);
    lines.push(`File id: ${params.planFile.id}`);
    lines.push(`Filename: ${params.planFile.original_filename}`);
    lines.push(
      `Status: ${params.planFile.status}${params.planFile.extraction_error ? ` (error: ${params.planFile.extraction_error.slice(0, 256)})` : ""}`
    );
    lines.push(`Call \`read_uploaded_file({ plan_file_id })\` to read it and help build a plan.`);
  }
  if (params.coldStartBuild) {
    lines.push(``);
    lines.push(`Cold-start plan build: true`);
  }
  if (params.stravaPreload) {
    lines.push(``);
    lines.push(`Strava preload (last 12 weeks + 4/12/52 rollups):`);
    lines.push(
      JSON.stringify(
        {
          athlete_summary: params.stravaPreload.athlete_summary,
          recent_activities_summary: params.stravaPreload.recent_activities_summary,
        },
        null,
        2
      )
    );
    if (params.stravaPreload.minimal) {
      lines.push(``);
      lines.push(`Strava history: minimal`);
    }
  }
  lines.push(`</context>`);
  return lines.join("\n");
}
