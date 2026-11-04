import "server-only";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { workouts } from "@/server/db/schema";
import type { SecondaryWorkout } from "@/server/db/schema";
import { getActivitiesForDateRange } from "@/server/strava/date-queries";
import { addDays } from "@/lib/dates";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";

export const RECENT_TRAINING_LOOKBACK_DAYS = 14;
export const RECENT_TRAINING_LOOKAHEAD_DAYS = 7;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const RUN_TYPES = new Set(["run", "virtualrun", "trailrun"]);
const BIKE_TYPES = new Set(["ride", "virtualride", "ebikeride", "gravelride", "mountainbikeride"]);

function matchesSport(activityType: string, sport: "run" | "bike"): boolean {
  const t = activityType.toLowerCase();
  return sport === "run" ? RUN_TYPES.has(t) : BIKE_TYPES.has(t);
}

function dayName(iso: string): string {
  return DAY_NAMES[new Date(`${iso}T12:00:00`).getDay()];
}

type PlannedRow = {
  date: string;
  type: string;
  distance_meters: string | null;
  duration_seconds: number | null;
  notes: string;
  secondary: SecondaryWorkout | null;
};

type ActualRow = {
  date: string;
  name: string;
  type: string;
  distance_meters: number | null;
  moving_time_seconds: number | null;
  avg_pace_seconds_per_km: number | null;
  avg_hr: number | null;
  matched: boolean;
};

export type RecentTraining = {
  from: string;
  to: string;
  lookahead_to: string;
  planned: PlannedRow[];
  actual: ActualRow[];
  sport: "run" | "bike";
};

/**
 * Loads the athlete's planned workouts for [today-14d, today+7d] and Strava
 * activities for [today-14d, today]. Rendered into the per-turn context so the
 * coach opens every conversation knowing what actually happened versus what
 * was scheduled — without a tool call.
 */
export async function fetchRecentTraining(params: {
  userId: string;
  planId: string;
  sport: "run" | "bike";
  today: string;
}): Promise<RecentTraining> {
  const from = addDays(params.today, -RECENT_TRAINING_LOOKBACK_DAYS);
  const lookaheadTo = addDays(params.today, RECENT_TRAINING_LOOKAHEAD_DAYS);

  const [plannedRows, activityRows] = await Promise.all([
    db
      .select({
        date: workouts.date,
        type: workouts.type,
        distance_meters: workouts.distance_meters,
        duration_seconds: workouts.duration_seconds,
        notes: workouts.notes,
        secondary: workouts.secondary,
      })
      .from(workouts)
      .where(
        and(
          eq(workouts.plan_id, params.planId),
          gte(workouts.date, from),
          lte(workouts.date, lookaheadTo)
        )
      )
      .orderBy(asc(workouts.date)),
    getActivitiesForDateRange(params.userId, from, params.today),
  ]);

  const planned: PlannedRow[] = plannedRows.map((r) => ({
    date: r.date,
    type: r.type,
    distance_meters: r.distance_meters,
    duration_seconds: r.duration_seconds,
    notes: r.notes,
    secondary: (r.secondary as SecondaryWorkout | null) ?? null,
  }));

  const actual: ActualRow[] = activityRows.map((a) => ({
    date: a.start_date.toISOString().slice(0, 10),
    name: a.name,
    type: a.type,
    distance_meters: a.distance_meters != null ? Number(a.distance_meters) : null,
    moving_time_seconds: a.moving_time_seconds,
    avg_pace_seconds_per_km:
      a.avg_pace_seconds_per_km != null ? Number(a.avg_pace_seconds_per_km) : null,
    avg_hr: a.avg_hr != null ? Number(a.avg_hr) : null,
    matched: a.matched_workout_id != null,
  }));

  return {
    from,
    to: params.today,
    lookahead_to: lookaheadTo,
    planned,
    actual,
    sport: params.sport,
  };
}

function fmtPlanned(
  type: string,
  distance_meters: string | number | null | undefined,
  duration_seconds: number | null | undefined,
  units: "mi" | "km"
): string {
  const dist = distance_meters != null ? formatDistance(distance_meters, units) : null;
  const dur = duration_seconds != null ? formatDuration(duration_seconds) : null;
  const parts = [type];
  if (dist) parts.push(`${dist} ${units}`);
  else if (dur) parts.push(dur);
  return parts.join(" ");
}

function fmtActual(a: ActualRow, units: "mi" | "km"): string {
  const parts: string[] = [`${a.type} "${a.name}"`];
  const dist = a.distance_meters != null ? formatDistance(a.distance_meters, units) : null;
  if (dist) parts.push(`${dist} ${units}`);
  const dur = a.moving_time_seconds != null ? formatDuration(a.moving_time_seconds) : null;
  if (dur) parts.push(dur);
  if (a.avg_pace_seconds_per_km != null && a.avg_pace_seconds_per_km > 0) {
    parts.push(`${formatPace(a.avg_pace_seconds_per_km, units)}/${units}`);
  }
  if (a.avg_hr != null) parts.push(`HR ${Math.round(a.avg_hr)}`);
  return parts.join(", ");
}

/**
 * Compact, deterministic text block. One line per day. Kept small (~600–900
 * tokens) because it lands in every chat turn's user message.
 */
export function renderRecentTraining(rt: RecentTraining, units: "mi" | "km"): string {
  const plannedByDate = new Map<string, PlannedRow>();
  for (const p of rt.planned) plannedByDate.set(p.date, p);
  const actualByDate = new Map<string, ActualRow[]>();
  for (const a of rt.actual) {
    const arr = actualByDate.get(a.date) ?? [];
    arr.push(a);
    actualByDate.set(a.date, arr);
  }

  let plannedMeters = 0;
  let actualMeters = 0;
  const lines: string[] = [];

  for (let d = rt.from; d <= rt.lookahead_to; d = addDays(d, 1)) {
    const isFuture = d > rt.to;
    const p = plannedByDate.get(d);
    const acts = actualByDate.get(d) ?? [];
    const label = `${d} ${dayName(d)}${d === rt.to ? " (today)" : ""}`;

    let plannedText = "rest";
    if (p && p.type !== "rest") {
      plannedText = fmtPlanned(p.type, p.distance_meters, p.duration_seconds, units);
      if (p.secondary) {
        const secMeters = p.secondary.distance_km != null ? p.secondary.distance_km * 1000 : null;
        const secSeconds =
          p.secondary.duration_minutes != null ? p.secondary.duration_minutes * 60 : null;
        plannedText += ` + PM ${fmtPlanned(p.secondary.type, secMeters, secSeconds, units)}`;
      }
      if (!isFuture) {
        plannedMeters += p.distance_meters != null ? Number(p.distance_meters) : 0;
        if (p.secondary?.distance_km != null) plannedMeters += p.secondary.distance_km * 1000;
      }
    }

    if (isFuture) {
      lines.push(`${label} | planned: ${plannedText}`);
      continue;
    }

    const actualText =
      acts.length === 0
        ? d === rt.to
          ? "nothing yet"
          : "none"
        : acts.map((a) => fmtActual(a, units)).join("; ");
    for (const a of acts) {
      if (matchesSport(a.type, rt.sport)) actualMeters += a.distance_meters ?? 0;
    }
    lines.push(`${label} | planned: ${plannedText} | actual: ${actualText}`);
  }

  const pct = plannedMeters > 0 ? Math.round((actualMeters / plannedMeters) * 100) : null;
  const summary =
    `Last ${RECENT_TRAINING_LOOKBACK_DAYS} days (${rt.sport}): planned ${formatDistance(plannedMeters, units)} ${units}, ` +
    `completed ${formatDistance(actualMeters, units)} ${units}` +
    (pct != null ? ` (${pct}%)` : "");

  return [
    `Recent training — planned vs actual for the last ${RECENT_TRAINING_LOOKBACK_DAYS} days, then the next ${RECENT_TRAINING_LOOKAHEAD_DAYS} days planned:`,
    summary,
    ...lines,
  ].join("\n");
}
