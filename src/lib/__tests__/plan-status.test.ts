import { describe, it, expect } from "vitest";
import { PLAN_STATUS_LABEL, planHasEnded, planStatus } from "../plan-status";

describe("planStatus", () => {
  it("is in progress while the coach is still building it", () => {
    expect(planStatus({ is_active: true, generation_status: "generating" })).toBe("generating");
  });

  it("is active when it is the plan on the calendar", () => {
    expect(planStatus({ is_active: true, generation_status: "complete" })).toBe("active");
  });

  it("is inactive otherwise, whenever it starts or ends", () => {
    expect(planStatus({ is_active: false, generation_status: "complete" })).toBe("inactive");
    expect(planStatus({ is_active: false })).toBe("inactive");
  });

  it("has a label for every status, and none of them is 'archived' or 'upcoming'", () => {
    expect(PLAN_STATUS_LABEL).toEqual({
      active: "Active",
      generating: "In progress",
      inactive: "Inactive",
    });
  });
});

describe("planHasEnded", () => {
  const TODAY = "2026-11-12";

  it("is true once the last day is behind the athlete", () => {
    expect(planHasEnded("2026-11-11", TODAY)).toBe(true);
  });

  it("is false on the last day and before it", () => {
    expect(planHasEnded(TODAY, TODAY)).toBe(false);
    expect(planHasEnded("2027-03-07", TODAY)).toBe(false);
  });

  it("is false for an open-ended plan", () => {
    expect(planHasEnded(null, TODAY)).toBe(false);
  });
});
