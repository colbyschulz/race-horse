export const BUILD_FORM_SENTINEL = "<!-- build_form_request -->";

export type BuildFormSport = "run" | "bike";
export type BuildFormGoal = "race" | "indefinite";
export type BuildFormUnit = "mi" | "km";

export type BuildFormInput = {
  sport: BuildFormSport;
  goal_type: BuildFormGoal;
  race_date?: string;
  race_event?: string;
  target_time?: string;
  weekly_mileage?: number;
  weekly_mileage_unit?: BuildFormUnit;
  context?: string;
};

const SPORT_LABEL: Record<BuildFormSport, string> = {
  run: "Run",
  bike: "Bike",
};

export function formatBuildForm(input: BuildFormInput): string {
  const lines: string[] = [BUILD_FORM_SENTINEL, "**Build a plan**", ""];

  lines.push(`- **Sport:** ${SPORT_LABEL[input.sport]}`);

  if (input.goal_type === "race") {
    const event = input.race_event?.trim() ?? "";
    const date = input.race_date?.trim() ?? "";
    const tail = [event, date].filter((s) => s.length > 0).join(", ");
    lines.push(`- **Goal:** Race — ${tail}`);
  } else {
    lines.push(`- **Goal:** Indefinite build`);
  }

  const tt = input.target_time?.trim();
  if (tt) lines.push(`- **Target time:** ${tt}`);

  if (typeof input.weekly_mileage === "number" && Number.isFinite(input.weekly_mileage)) {
    const unit = input.weekly_mileage_unit ?? "mi";
    lines.push(`- **Weekly mileage:** ${input.weekly_mileage} ${unit}`);
  }

  const ctx = input.context?.trim().replace(/\n+/g, " ");
  if (ctx) lines.push(`- **Goals & context:** ${ctx}`);

  return lines.join("\n");
}

const SPORT_FROM_LABEL: Record<string, BuildFormSport> = {
  Run: "run",
  Bike: "bike",
};

export function parseBuildForm(text: string): BuildFormInput | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(BUILD_FORM_SENTINEL)) return null;

  const body = trimmed.slice(BUILD_FORM_SENTINEL.length);

  const sportMatch = body.match(/^- \*\*Sport:\*\* (Run|Bike)$/m);
  const goalMatch = body.match(/^- \*\*Goal:\*\* (Race — (.+)|Indefinite build)$/m);
  if (!sportMatch || !goalMatch) return null;

  const sport = SPORT_FROM_LABEL[sportMatch[1]];
  if (!sport) return null;

  const out: BuildFormInput = {
    sport,
    goal_type: goalMatch[1].startsWith("Race") ? "race" : "indefinite",
  };

  if (out.goal_type === "race") {
    const tail = goalMatch[2] ?? "";
    const parts = tail
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const dateIdx = parts.findIndex((p) => /^\d{4}-\d{2}-\d{2}$/.test(p));
    if (dateIdx !== -1) {
      out.race_date = parts[dateIdx];
      const eventParts = parts.filter((_, i) => i !== dateIdx);
      if (eventParts.length > 0) out.race_event = eventParts.join(", ");
    } else if (parts.length > 0) {
      out.race_event = parts.join(", ");
    }
  }

  const ttMatch = body.match(/^- \*\*Target time:\*\* (.+)$/m);
  if (ttMatch) out.target_time = ttMatch[1].trim();

  const wmMatch = body.match(/^- \*\*Weekly mileage:\*\* (\d+(?:\.\d+)?) (mi|km)$/m);
  if (wmMatch) {
    out.weekly_mileage = Number(wmMatch[1]);
    out.weekly_mileage_unit = wmMatch[2] as BuildFormUnit;
  }

  const ctxMatch = body.match(/^- \*\*Goals & context:\*\* (.+)$/m);
  if (ctxMatch) out.context = ctxMatch[1].trim();

  return out;
}
