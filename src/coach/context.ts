type ActivePlanSummary = {
  title: string;
  weeks_left: number | null;
  workout_count: number;
  completed: number;
};

const ROUTE_LABELS: Record<string, string> = {
  "/today": "Today view",
  "/calendar": "Calendar view",
  "/plans": "Plans / manage page",
  "/settings": "Settings page",
};

export function routeLabel(from: string | undefined | null): string | null {
  if (!from) return null;
  return ROUTE_LABELS[from] ?? null;
}

export function renderContextPrefix(params: {
  today: string;                       // YYYY-MM-DD
  units: "mi" | "km";
  activePlan: ActivePlanSummary | null;
  coachNotes: string;
  fromLabel: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`<context>`);
  lines.push(`Today: ${params.today}`);
  lines.push(`User units: ${params.units}`);
  if (params.activePlan) {
    const a = params.activePlan;
    const wks = a.weeks_left == null ? "indefinite" : `${a.weeks_left} weeks left`;
    lines.push(
      `Active plan: ${a.title} — ${wks}, ${a.completed} / ${a.workout_count} workouts done`,
    );
  }
  if (params.coachNotes.trim()) {
    lines.push(``);
    lines.push(`Coach notes:`);
    lines.push(params.coachNotes.trim());
  }
  if (params.fromLabel) {
    lines.push(``);
    lines.push(`User opened coach from: ${params.fromLabel}`);
  }
  lines.push(`</context>`);
  return lines.join("\n");
}
