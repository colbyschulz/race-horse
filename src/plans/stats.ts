import type { Goal, Sport } from "./types";

const MS_PER_DAY = 86_400_000;

function parseISODate(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function computeWeeksLeft(endDate: string | null, today: string): number | null {
  if (!endDate) return null;
  const end = parseISODate(endDate).getTime();
  const now = parseISODate(today).getTime();
  const days = Math.ceil((end - now) / MS_PER_DAY);
  return Math.max(0, Math.ceil(days / 7));
}

export function formatDuration(startDate: string, endDate: string | null): string {
  if (!endDate) return "indefinite";
  const start = parseISODate(startDate).getTime();
  const end = parseISODate(endDate).getTime();
  const weeks = Math.round((end - start) / (MS_PER_DAY * 7));
  return `${weeks} weeks`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatRaceDate(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatGoal(goal: Goal | null): string | null {
  if (!goal) return null;
  const tgt = goal.target_time ?? goal.race_distance;
  if (!tgt && !goal.race_date) return null;
  const parts: string[] = [];
  if (tgt) parts.push(tgt);
  if (goal.race_date) parts.push(formatRaceDate(goal.race_date));
  return `Goal: ${parts.join(" · ")}`;
}

export function formatSport(sport: Sport): string {
  return sport === "run" ? "🏃 Run" : "🚴 Bike";
}
