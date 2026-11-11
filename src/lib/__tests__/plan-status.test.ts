import { describe, it, expect } from "vitest";
import { planStatus } from "../plan-status";

const TODAY = "2026-11-11";
const plan = (overrides: object = {}) => ({
  is_active: false,
  end_date: "2027-03-01" as string | null,
  generation_status: "complete" as const,
  ...overrides,
});

describe("planStatus", () => {
  it("is in progress while the coach is still building it", () => {
    expect(planStatus(plan({ generation_status: "generating", is_active: true }), TODAY)).toBe(
      "generating"
    );
  });

  it("is active when it is the plan on the calendar", () => {
    expect(planStatus(plan({ is_active: true }), TODAY)).toBe("active");
  });

  it("is not active, rather than upcoming or archived, when it hasn't ended", () => {
    expect(planStatus(plan(), TODAY)).toBe("inactive");
    expect(planStatus(plan({ end_date: TODAY }), TODAY)).toBe("inactive");
    // An open-ended plan has no end to pass.
    expect(planStatus(plan({ end_date: null }), TODAY)).toBe("inactive");
  });

  it("is archived once its end date has passed", () => {
    expect(planStatus(plan({ end_date: "2026-11-10" }), TODAY)).toBe("archived");
  });
});
