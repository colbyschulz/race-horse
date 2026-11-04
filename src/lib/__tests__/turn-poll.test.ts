import { describe, it, expect } from "vitest";
import { decideTurnPollOutcome, TURN_CUT_OFF_MESSAGE, TURN_STALE_MS, type Turn } from "../turn-poll";

const NOW = new Date("2026-01-01T00:10:00Z").getTime();

function runningTurn(startedMsAgo: number): Turn {
  return {
    status: "running",
    error_message: null,
    started_at: new Date(NOW - startedMsAgo).toISOString(),
  };
}

describe("decideTurnPollOutcome", () => {
  it("keeps polling when the turn is running and not stale", () => {
    expect(decideTurnPollOutcome(runningTurn(1000), false, NOW)).toEqual({ kind: "keep-polling" });
  });

  it("alerts on a stale running turn even on the very first poll of a fresh mount", () => {
    // Regression for: a hard platform kill can leave a row stuck on "running"
    // forever. Reopening the app more than TURN_STALE_MS later must surface
    // this as a failure on the FIRST poll, not require having watched it run
    // first in this session.
    const outcome = decideTurnPollOutcome(runningTurn(TURN_STALE_MS + 1000), false, NOW);
    expect(outcome.kind).toBe("alert");
  });

  it("alerts on a turn that goes stale after being watched running", () => {
    const outcome = decideTurnPollOutcome(runningTurn(TURN_STALE_MS + 1000), true, NOW);
    expect(outcome.kind).toBe("alert");
  });

  it("does nothing for a turn that finished long ago on an ordinary fresh load", () => {
    const turn: Turn = { status: "done", error_message: null, started_at: new Date(NOW).toISOString() };
    expect(decideTurnPollOutcome(turn, false, NOW)).toEqual({ kind: "idle" });
  });

  it("reloads history once a watched turn completes", () => {
    const turn: Turn = { status: "done", error_message: null, started_at: new Date(NOW).toISOString() };
    expect(decideTurnPollOutcome(turn, true, NOW)).toEqual({ kind: "reload" });
  });

  it("does nothing for a turn that errored long ago on an ordinary fresh load", () => {
    const turn: Turn = { status: "error", error_message: "boom", started_at: new Date(NOW).toISOString() };
    expect(decideTurnPollOutcome(turn, false, NOW)).toEqual({ kind: "idle" });
  });

  it("alerts with the server's message once a watched turn errors", () => {
    const turn: Turn = { status: "error", error_message: "boom", started_at: new Date(NOW).toISOString() };
    expect(decideTurnPollOutcome(turn, true, NOW)).toEqual({ kind: "alert", message: "boom" });
  });

  it("falls back to a generic message when an errored turn has no error_message", () => {
    const turn: Turn = { status: "error", error_message: null, started_at: new Date(NOW).toISOString() };
    const outcome = decideTurnPollOutcome(turn, true, NOW);
    expect(outcome).toEqual({
      kind: "alert",
      message: TURN_CUT_OFF_MESSAGE,
    });
  });

  it("does nothing when no turn has ever been recorded", () => {
    expect(decideTurnPollOutcome(null, false, NOW)).toEqual({ kind: "idle" });
  });
});
