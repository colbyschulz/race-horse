import type { StoredMessage } from "@/types/coach";

/** The API's stand-in for unfinished work when a reply is cut off; not a real note. */
const INTERRUPTED_NOTE = "This part of the response was interrupted before it finished.";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const month = MONTHS[Number(m[1]) - 1];
  return month ? `${month} ${Number(m[2])}` : null;
}

type ToolInput = {
  from?: unknown;
  to?: unknown;
  week_number?: unknown;
  total_weeks?: unknown;
  operations?: { date?: unknown }[];
};

function planWindow(input: ToolInput): string {
  const from = shortDate(input.from);
  const to = shortDate(input.to);
  if (from && to) return `, ${from}–${to}`;
  if (from) return ` from ${from}`;
  if (to) return ` through ${to}`;
  return "";
}

function workoutScope(input: ToolInput): string | null {
  const ops = Array.isArray(input.operations) ? input.operations : [];
  if (ops.length === 1) return shortDate(ops[0].date);
  if (ops.length > 1) return `${ops.length} days`;
  return null;
}

/** What the coach is doing right now. `input` is missing until the call is fully written. */
export function describeToolInProgress(name: string, input?: unknown): string {
  const i = (input ?? {}) as ToolInput;
  switch (name) {
    case "get_active_plan":
    case "get_plan":
      return `Reading your plan${planWindow(i)}…`;
    case "list_plans":
      return "Looking at your plans…";
    case "create_plan":
      return "Starting a new plan…";
    case "update_workouts": {
      if (typeof i.week_number === "number" && typeof i.total_weeks === "number") {
        return `Writing week ${i.week_number} of ${i.total_weeks}…`;
      }
      const scope = workoutScope(i);
      return scope ? `Updating ${scope}…` : "Updating your plan…";
    }
    case "set_active_plan":
      return "Changing your active plan…";
    case "archive_plan":
      return "Making a plan inactive…";
    case "finalize_plan":
      return "Finishing your plan…";
    case "get_recent_activities":
      return "Pulling your recent activities…";
    case "get_activity_laps":
      return "Reading your splits…";
    case "update_activity_match":
      return "Linking a workout to an activity…";
    case "get_athlete_summary":
      return "Reviewing your training history…";
    case "update_coach_notes":
    case "update_plan_notes":
      return "Saving a note…";
    case "read_uploaded_file":
      return "Reading your uploaded plan…";
    case "request_deep_planning":
      return "Planning across several weeks…";
    case "web_search":
      return "Searching the web…";
    default:
      return "Working…";
  }
}

/** The kinds of turn known to take a while, so the athlete can be told up front. */
export type TurnExpectation = "plan" | "deep";

/**
 * Whether a step marks its turn as one of the long kinds. `buildingPlan` is
 * true when the conversation is building a new plan, where any write is the
 * start of many; otherwise a write counts once it names its week of the plan.
 */
export function stepExpectation(
  name: string,
  input?: unknown,
  buildingPlan = false
): TurnExpectation | null {
  if (name === "request_deep_planning") return "deep";
  if (name === "update_workouts") {
    const i = (input ?? {}) as ToolInput;
    const namesItsWeek = typeof i.week_number === "number" && typeof i.total_weeks === "number";
    if (buildingPlan || namesItsWeek) return "plan";
  }
  return null;
}

/** The same step after it has finished, for conversation history. */
export function describeToolDone(name: string, input?: unknown): string {
  const i = (input ?? {}) as ToolInput;
  switch (name) {
    case "get_active_plan":
    case "get_plan":
      return `Read your plan${planWindow(i)}`;
    case "list_plans":
      return "Looked at your plans";
    case "create_plan":
      return "Started a new plan";
    case "update_workouts": {
      if (typeof i.week_number === "number" && typeof i.total_weeks === "number") {
        return `Wrote week ${i.week_number} of ${i.total_weeks}`;
      }
      const scope = workoutScope(i);
      return scope ? `Updated ${scope}` : "Updated your plan";
    }
    case "set_active_plan":
      return "Changed your active plan";
    case "archive_plan":
      return "Made a plan inactive";
    case "finalize_plan":
      return "Finished your plan";
    case "get_recent_activities":
      return "Pulled your recent activities";
    case "get_activity_laps":
      return "Read your splits";
    case "update_activity_match":
      return "Linked a workout to an activity";
    case "get_athlete_summary":
      return "Reviewed your training history";
    case "update_coach_notes":
    case "update_plan_notes":
      return "Saved a note";
    case "read_uploaded_file":
      return "Read your uploaded plan";
    case "request_deep_planning":
      return "Planned across several weeks";
    default:
      return "Finished a step";
  }
}

export function isProgressNote(text: string): boolean {
  return text.trim().length > 0 && text.trim() !== INTERRUPTED_NOTE;
}

const NARRATION_MAX_CHARS = 200;

/**
 * Short text written just before a tool call is the coach narrating its work,
 * not a reply. Longer text, such as a plan's block design, stays a full message.
 */
export function isStepNarration(text: string): boolean {
  return isProgressNote(text) && text.trim().length <= NARRATION_MAX_CHARS;
}

export type ActivityStep = { kind: "tool"; label: string } | { kind: "note"; text: string };

export type TimelineEntry =
  | { kind: "message"; message: StoredMessage }
  | { kind: "activity"; key: string; steps: ActivityStep[] };

/**
 * Turns stored messages into what the chat shows: replies, plus the steps the
 * coach took between them. Tool results come back as user rows with no text, so
 * they're skipped and don't split a run of steps.
 */
export function buildTimeline(messages: StoredMessage[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let steps: ActivityStep[] = [];
  let stepsKey = "";

  const flush = () => {
    if (steps.length > 0) entries.push({ kind: "activity", key: stepsKey, steps });
    steps = [];
  };
  const addStep = (message: StoredMessage, index: number, step: ActivityStep) => {
    if (steps.length === 0) stepsKey = `activity-${message.id}-${index}`;
    steps.push(step);
  };

  for (const message of messages) {
    const blocks = message.content as { type: string; text?: string; thinking?: string; name?: string; input?: unknown }[];

    if (message.role === "user") {
      if (!blocks.some((b) => b.type === "text")) continue;
      flush();
      entries.push({ kind: "message", message });
      continue;
    }

    const callsTool = blocks.some((b) => b.type === "tool_use");
    let added = false;
    blocks.forEach((block, index) => {
      if (block.type === "thinking" && isProgressNote(block.thinking ?? "")) {
        addStep(message, index, { kind: "note", text: (block.thinking ?? "").trim() });
      } else if (block.type === "tool_use") {
        addStep(message, index, { kind: "tool", label: describeToolDone(block.name ?? "", block.input) });
      } else if (block.type === "text" && callsTool && isStepNarration(block.text ?? "")) {
        addStep(message, index, { kind: "note", text: (block.text ?? "").trim() });
      } else if (block.type === "text" && !added && (block.text ?? "").trim()) {
        flush();
        entries.push({ kind: "message", message });
        added = true;
      }
    });
  }
  flush();
  return entries;
}
