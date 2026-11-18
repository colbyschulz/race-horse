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
        planSport="run"
        isActivePlan={false}
      />
    );

    // 8km primary + 3km secondary = 11.0km, not just the primary's 8.0km.
    expect(screen.getByText("11.0 km")).toBeInTheDocument();
  });

  it("totals runs and rides separately, and counts a walk toward neither", () => {
    const monday = "2026-06-01";
    const byDate = new Map<string, WorkoutRow>([
      [monday, makeWorkout({ date: monday, distance_meters: "8000" })],
      [
        "2026-06-02",
        makeWorkout({ id: "w2", date: "2026-06-02", sport: "bike", distance_meters: "40000" }),
      ],
    ]);
    const activity = (id: string, type: string, meters: number) =>
      ({ id, strava_id: id, name: type, type, distance_meters: String(meters) }) as never;
    const activitiesByDate = new Map([
      [monday, [activity("a1", "Run", 8200), activity("a2", "Walk", 5000)]],
      ["2026-06-02", [activity("a3", "GravelRide", 41000)]],
    ]);

    const { container } = render(
      <WeekAgendaRows
        monday={monday}
        byDate={byDate}
        activitiesByDate={activitiesByDate}
        today="2026-06-01"
        units="km"
        planSport="run"
        isActivePlan={false}
      />
    );

    const run = container.querySelector('[data-sport="run"]');
    const ride = container.querySelector('[data-sport="bike"]');
    expect(run).toHaveTextContent("Run total8.0 km");
    // The walk's 5 km stays out of the run.
    expect(run).toHaveTextContent("Completed run8.2 km");
    expect(ride).toHaveTextContent("Ride total40.0 km");
    expect(ride).toHaveTextContent("Completed ride41.0 km");
  });
});
