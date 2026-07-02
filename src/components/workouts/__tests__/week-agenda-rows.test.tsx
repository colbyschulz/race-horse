import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeekAgendaRows } from "../week-agenda-rows";
import type { WorkoutRow } from "@/types/plans";

function makeWorkout(overrides: Partial<WorkoutRow>): WorkoutRow {
  return {
    id: "w1",
    plan_id: "p1",
    date: "2026-06-01",
    sport: "run",
    type: "easy",
    distance_meters: null,
    duration_seconds: null,
    target_intensity: null,
    intervals: null,
    notes: "",
    secondary: null,
    ...overrides,
  } as WorkoutRow;
}

describe("WeekAgendaRows week total", () => {
  it("includes the secondary (doubles) distance in the week total", () => {
    const monday = "2026-06-01";
    const byDate = new Map<string, WorkoutRow>([
      [
        monday,
        makeWorkout({
          date: monday,
          distance_meters: "8000",
          secondary: { type: "easy", distance_km: 3 },
        }),
      ],
    ]);

    render(
      <WeekAgendaRows
        monday={monday}
        byDate={byDate}
        today="2026-06-01"
        units="km"
        isActivePlan={false}
      />
    );

    // 8km primary + 3km secondary = 11.0km, not just the primary's 8.0km.
    expect(screen.getByText("11.0 km")).toBeInTheDocument();
  });
});
