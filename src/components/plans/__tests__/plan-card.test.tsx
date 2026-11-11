import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanCard } from "../plan-card";
import type { PlanWithCounts } from "@/types/plans";

function makePlan(overrides: Partial<PlanWithCounts> = {}): PlanWithCounts {
  return {
    id: "plan-1",
    userId: "u1",
    title: "Marathon Block",
    sport: "run",
    mode: "goal",
    goal: null,
    start_date: "2026-01-01",
    end_date: "2026-04-01",
    is_active: false,
    source: "coach_generated",
    source_file_id: null,
    coach_notes: "",
    generation_status: "complete",
    created_at: new Date(),
    updated_at: new Date(),
    max_weekly_meters: 0,
    longest_run_meters: 0,
    ...overrides,
  };
}

describe("PlanCard", () => {
  it("links to the plan detail page when complete", () => {
    render(<PlanCard plan={makePlan()} today="2026-02-01" units="mi" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/plans/plan-1");
  });

  it("links into the coach conversation while still generating", () => {
    render(<PlanCard plan={makePlan({ generation_status: "generating" })} today="2026-02-01" units="mi" />);
    const href = screen.getByRole("link").getAttribute("href");
    expect(href).toContain("/coach?plan_id=plan-1");
    expect(href).toContain("from_label=Marathon%20Block");
  });
});

describe("PlanCard status", () => {
  it("says a plan that isn't active is not active, even when it starts in the future", () => {
    render(
      <PlanCard
        plan={makePlan({ start_date: "2026-03-02", end_date: "2026-06-01" })}
        today="2026-02-01"
        units="mi"
      />
    );
    expect(screen.getByText("Not active")).toBeInTheDocument();
    expect(screen.queryByText("Upcoming")).not.toBeInTheDocument();
  });

  it("doesn't call a new plan archived just because it has started", () => {
    render(<PlanCard plan={makePlan()} today="2026-02-01" units="mi" />);
    expect(screen.getByText("Not active")).toBeInTheDocument();
  });

  it("calls a plan archived once it has ended", () => {
    render(<PlanCard plan={makePlan()} today="2026-05-01" units="mi" />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
});
