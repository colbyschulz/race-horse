export const TURN_POLL_INTERVAL_MS = 2500;
export const TURN_STALE_MS = 6 * 60 * 1000;

export const TURN_CUT_OFF_MESSAGE =
  "The coach ran out of time on that reply. Anything it already saved is still in your plan, and you can ask it to keep going.";

export const COACH_UNREACHABLE_MESSAGE =
  "Couldn't reach the coach. Check your connection and try again.";

export function isTurnStale(status: string, startedAt: string | Date, now: number): boolean {
  return status === "running" && now - new Date(startedAt).getTime() > TURN_STALE_MS;
}

export type Turn = { status: "running" | "done" | "error"; error_message: string | null; started_at: string } | null;

export type TurnPollOutcome =
  | { kind: "keep-polling" }
  | { kind: "idle" }
  | { kind: "reload" }
  | { kind: "alert"; message: string };

/**
 * Pure decision step for the coach-page reconnect poll. `observedRunning` is
 * whether THIS mount has already seen the turn as running (vs. just loaded
 * fresh into an already-finished conversation) — it gates whether a `done`/
 * `error` result is worth surfacing, but NOT whether a stale `running` row
 * is: a hard platform kill can leave a row stuck on "running" forever, and
 * that must be caught on the very first poll of a fresh mount, not only
 * after having watched it run first. The status route closes a stale row as it
 * reports it, so this alert appears once rather than on every return.
 */
export function decideTurnPollOutcome(turn: Turn, observedRunning: boolean, now: number): TurnPollOutcome {
  const stale = turn != null && isTurnStale(turn.status, turn.started_at, now);

  if (turn?.status === "running" && !stale) {
    return { kind: "keep-polling" };
  }
  if (stale) {
    return { kind: "alert", message: turn?.error_message ?? TURN_CUT_OFF_MESSAGE };
  }
  if (!observedRunning) return { kind: "idle" };
  if (turn?.status === "done") return { kind: "reload" };
  if (turn?.status === "error") {
    return { kind: "alert", message: turn.error_message ?? TURN_CUT_OFF_MESSAGE };
  }
  return { kind: "idle" };
}
