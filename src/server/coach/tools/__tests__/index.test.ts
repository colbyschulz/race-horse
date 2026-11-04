import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/strava/queries", () => ({}));
vi.mock("@/server/plans/queries", () => ({}));
vi.mock("@/server/plans/files", () => ({}));

import { getColdStartTools, summarizeToolResult } from "../index";

const names = (tools: { name: string }[]) => tools.map((t) => t.name);

describe("getColdStartTools", () => {
  it("keeps other plans out of reach at the start of a build", () => {
    const tools = names(getColdStartTools("plan-1"));
    for (const hidden of ["get_plan", "get_active_plan", "list_plans", "create_plan", "archive_plan", "set_active_plan"]) {
      expect(tools).not.toContain(hidden);
    }
    expect(tools).toContain("update_workouts");
  });

  it("adds only get_plan once the build has weeks to re-read", () => {
    const tools = names(getColdStartTools("plan-1", { canReadPlan: true }));
    expect(tools).toContain("get_plan");
    for (const hidden of ["get_active_plan", "list_plans", "create_plan", "archive_plan", "set_active_plan"]) {
      expect(tools).not.toContain(hidden);
    }
  });
});

describe("summarizeToolResult", () => {
  it("names the session when reading splits", () => {
    expect(summarizeToolResult("get_activity_laps", { activity: { name: "Threshold Miles" } })).toBe(
      "Read your splits from Threshold Miles"
    );
    expect(summarizeToolResult("get_activity_laps", {})).toBe("Read your splits");
  });
});
