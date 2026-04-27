import { describe, it, expect } from "vitest";
import { computePlanStats, weeklyMileage } from "../planStats";

const w = (date: string, distance_meters: number | null, duration_seconds: number | null = null) =>
  ({ date, distance_meters: distance_meters == null ? null : String(distance_meters), duration_seconds, type: "easy" } as never);

describe("weeklyMileage", () => {
  it("buckets workouts into weeks (Mon-anchored)", () => {
    const workouts = [
      w("2026-04-20", 5000),  // Mon
      w("2026-04-21", 8000),
      w("2026-04-27", 10000), // next Mon
    ];
    const result = weeklyMileage(workouts, "mi");
    expect(result).toEqual([
      { mondayIso: "2026-04-20", miles: (13000 / 1609.344) },
      { mondayIso: "2026-04-27", miles: (10000 / 1609.344) },
    ]);
  });
  it("returns [] for no workouts", () => {
    expect(weeklyMileage([], "mi")).toEqual([]);
  });
  it("works in km", () => {
    const workouts = [w("2026-04-20", 10000)];
    const result = weeklyMileage(workouts, "km");
    expect(result[0].miles).toBeCloseTo(10);
  });
});

describe("computePlanStats", () => {
  it("totals, peak week, longest run, weeks count", () => {
    const workouts = [
      w("2026-04-20", 5000),
      w("2026-04-21", 8000),
      w("2026-04-27", 32000),  // longest run, peak week
      w("2026-05-04", 6000),
    ];
    const stats = computePlanStats(workouts, "mi");
    expect(stats.totalDistance).toBeCloseTo((51000 / 1609.344));
    expect(stats.peakWeek?.distance).toBeCloseTo((32000 / 1609.344));
    expect(stats.peakWeek?.mondayIso).toBe("2026-04-27");
    expect(stats.longestRun?.distance).toBeCloseTo((32000 / 1609.344));
    expect(stats.longestRun?.dateIso).toBe("2026-04-27");
    expect(stats.weeksCount).toBe(3);
  });
  it("handles empty plan", () => {
    const stats = computePlanStats([], "mi");
    expect(stats).toEqual({
      totalDistance: 0,
      peakWeek: null,
      longestRun: null,
      weeksCount: 0,
    });
  });
  it("ignores null distance workouts (rest days)", () => {
    const workouts = [w("2026-04-20", null), w("2026-04-21", 5000)];
    const stats = computePlanStats(workouts, "mi");
    expect(stats.totalDistance).toBeCloseTo(5000 / 1609.344);
    expect(stats.longestRun?.distance).toBeCloseTo(5000 / 1609.344);
  });
});
