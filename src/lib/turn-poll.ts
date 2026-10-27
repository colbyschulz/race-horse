export const TURN_POLL_INTERVAL_MS = 2500;
export const TURN_STALE_MS = 6 * 60 * 1000;

const GENERIC_TIMEOUT_MESSAGE =
  "That request took too long and didn't finish — try asking for a smaller piece at a time.";

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
 * after having watched it run first.
 */
export function decideTurnPollOutcome(turn: Turn, observedRunning: boolean, now: number): TurnPollOutcome {
  const stale = turn?.status === "running" && now - new Date(turn.started_at).getTime() > TURN_STALE_MS;

  if (turn?.status === "running" && !stale) {
    return { kind: "keep-polling" };
  }
  if (stale) {
    return { kind: "alert", message: turn?.error_message ?? GENERIC_TIMEOUT_MESSAGE };
  }
  if (!observedRunning) return { kind: "idle" };
  if (turn?.status === "done") return { kind: "reload" };
  if (turn?.status === "error") {
    return { kind: "alert", message: turn.error_message ?? GENERIC_TIMEOUT_MESSAGE };
  }
  return { kind: "idle" };
}
