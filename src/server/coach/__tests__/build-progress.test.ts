import { describe, it, expect } from "vitest";
import { isBuildUnfinished, latestBuildProgress, mergeBuildProgress } from "../build-progress";

const write = (week_number: number, total_weeks: number) => ({
  role: "assistant",
  content: [{ type: "tool_use", name: "update_workouts", input: { week_number, total_weeks, operations: [] } }],
});

describe("latestBuildProgress", () => {
  it("finds the furthest week written", () => {
    expect(latestBuildProgress([write(1, 19), write(12, 19)])).toEqual({ week: 12, total: 19 });
  });

  it("doesn't move back when an earlier week is rewritten at a check-in", () => {
    expect(latestBuildProgress([write(12, 19), write(4, 19)])).toEqual({ week: 12, total: 19 });
  });

  it("is null when no weeks have been written", () => {
    const question = { role: "assistant", content: [{ type: "text", text: "What's your long-run day?" }] };
    expect(latestBuildProgress([question])).toBeNull();
  });

  it("ignores edits without week numbers, other tools, and plain-text content", () => {
    const edit = {
      role: "assistant",
      content: [{ type: "tool_use", name: "update_workouts", input: { operations: [] } }],
    };
    const other = { role: "assistant", content: [{ type: "tool_use", name: "get_plan", input: { week_number: 3 } }] };
    const text = { role: "assistant", content: "Hello" };
    expect(latestBuildProgress([edit, other, text])).toBeNull();
  });

  it("uses the latest total if the plan's length changes", () => {
    expect(latestBuildProgress([write(12, 19), write(13, 18)])).toEqual({ week: 13, total: 18 });
  });
});

describe("mergeBuildProgress", () => {
  it("keeps what's known when the input has no week numbers", () => {
    expect(mergeBuildProgress({ week: 3, total: 10 }, { operations: [] })).toEqual({ week: 3, total: 10 });
    expect(mergeBuildProgress(null, null)).toBeNull();
  });
});

describe("isBuildUnfinished", () => {
  it("is true only when weeks remain", () => {
    expect(isBuildUnfinished({ week: 12, total: 19 })).toBe(true);
    expect(isBuildUnfinished({ week: 19, total: 19 })).toBe(false);
    expect(isBuildUnfinished(null)).toBe(false);
  });
});
