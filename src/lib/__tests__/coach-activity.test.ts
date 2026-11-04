import { describe, it, expect } from "vitest";
import { buildTimeline, describeToolDone, describeToolInProgress, isProgressNote } from "../coach-activity";
import type { StoredMessage } from "@/types/coach";

function message(id: string, role: "user" | "assistant", content: unknown[]): StoredMessage {
  return { id, role, plan_id: "p1", created_at: new Date("2026-11-04"), content } as StoredMessage;
}

describe("describeToolInProgress", () => {
  it("names the step before the call's details have arrived", () => {
    expect(describeToolInProgress("update_workouts")).toBe("Updating your plan…");
    expect(describeToolInProgress("get_plan")).toBe("Reading your plan…");
  });

  it("gets more specific once the details arrive", () => {
    expect(describeToolInProgress("update_workouts", { week_number: 3, total_weeks: 13, operations: [] })).toBe(
      "Writing week 3 of 13…"
    );
    expect(describeToolInProgress("update_workouts", { operations: [{ date: "2026-11-06" }] })).toBe(
      "Updating Nov 6…"
    );
    expect(describeToolInProgress("get_plan", { from: "2026-11-02", to: "2026-11-30" })).toBe(
      "Reading your plan, Nov 2–Nov 30…"
    );
  });

  it("handles a tool it doesn't recognize, and malformed dates", () => {
    expect(describeToolInProgress("something_new")).toBe("Working…");
    expect(describeToolInProgress("get_plan", { from: "soon" })).toBe("Reading your plan…");
  });
});

describe("describeToolDone", () => {
  it("describes finished steps", () => {
    expect(describeToolDone("get_activity_laps")).toBe("Read your splits");
    expect(describeToolDone("update_workouts", { operations: [{ date: "2026-11-06" }, { date: "2026-11-07" }] })).toBe(
      "Updated 2 days"
    );
    expect(describeToolDone("something_new")).toBe("Finished a step");
  });
});

describe("isProgressNote", () => {
  it("ignores empty blocks and the API's interrupted-work stand-in", () => {
    expect(isProgressNote("Checking your laps next.")).toBe(true);
    expect(isProgressNote("  ")).toBe(false);
    expect(isProgressNote("This part of the response was interrupted before it finished.")).toBe(false);
  });
});

describe("buildTimeline", () => {
  it("groups steps across tool rounds and places them before the reply", () => {
    const timeline = buildTimeline([
      message("u1", "user", [{ type: "text", text: "What should I run?" }]),
      message("a1", "assistant", [
        { type: "thinking", thinking: "", signature: "s" },
        { type: "tool_use", id: "t1", name: "get_active_plan", input: {} },
      ]),
      message("u2", "user", [{ type: "tool_result", tool_use_id: "t1", content: "{}" }]),
      message("a2", "assistant", [
        { type: "thinking", thinking: "Your plan looks heavy, so I'm checking your laps.", signature: "s" },
        { type: "tool_use", id: "t2", name: "get_activity_laps", input: {} },
      ]),
      message("u3", "user", [{ type: "tool_result", tool_use_id: "t2", content: "{}" }]),
      message("a3", "assistant", [{ type: "text", text: "Run easy." }]),
    ]);

    expect(timeline.map((e) => e.kind)).toEqual(["message", "activity", "message"]);
    expect(timeline[1]).toMatchObject({
      steps: [
        { kind: "tool", label: "Read your plan" },
        { kind: "note", text: "Your plan looks heavy, so I'm checking your laps." },
        { kind: "tool", label: "Read your splits" },
      ],
    });
  });

  it("treats short text before a tool call as a step, not a reply", () => {
    const timeline = buildTimeline([
      message("a1", "assistant", [
        { type: "text", text: "Writing week 1 now." },
        { type: "tool_use", id: "t1", name: "update_workouts", input: { week_number: 1, total_weeks: 2 } },
      ]),
    ]);
    expect(timeline).toMatchObject([
      {
        kind: "activity",
        steps: [
          { kind: "note", text: "Writing week 1 now." },
          { kind: "tool", label: "Wrote week 1 of 2" },
        ],
      },
    ]);
  });

  it("keeps long text before a tool call as a full message, in order", () => {
    const blockDesign = "Weeks 1–4 build threshold in longer blocks. ".repeat(8);
    const timeline = buildTimeline([
      message("a1", "assistant", [
        { type: "text", text: blockDesign },
        { type: "tool_use", id: "t1", name: "update_workouts", input: { week_number: 1, total_weeks: 2 } },
      ]),
    ]);
    expect(timeline.map((e) => e.kind)).toEqual(["message", "activity"]);
  });

  it("adds nothing for a plain reply, and leaves trailing steps visible during a running turn", () => {
    expect(buildTimeline([message("a1", "assistant", [{ type: "text", text: "Hi." }])])).toHaveLength(1);
    const running = buildTimeline([
      message("u1", "user", [{ type: "text", text: "Go." }]),
      message("a1", "assistant", [{ type: "tool_use", id: "t1", name: "get_plan", input: {} }]),
    ]);
    expect(running.at(-1)?.kind).toBe("activity");
  });

  it("gives groups stable keys across refreshes", () => {
    const msgs = [message("a1", "assistant", [{ type: "tool_use", id: "t1", name: "get_plan", input: {} }])];
    const [a] = buildTimeline(msgs);
    const [b] = buildTimeline(msgs);
    expect(a).toEqual(b);
  });
});
