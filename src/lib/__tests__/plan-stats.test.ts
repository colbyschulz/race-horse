import { describe, it, expect } from "vitest";
import { computePlanStats, weeklyMileage } from "../plan-stats";

const w = (date: string, distance_meters: number | null, duration_seconds: number | null = null) =>
  ({
    date,
    distance_meters: distance_meters == null ? null : String(distance_meters),
    duration_seconds,
    sport: "run",
    type: "easy",
  }) as never;

describe("weeklyMileage", () => {
  it("buckets workouts into weeks (Mon-anchored)", () => {
    const workouts = [
      w("2026-04-20", 5000), // Mon
      w("2026-04-21", 8000),
      w("2026-04-27", 10000), // next Mon
    ];
    const result = weeklyMileage(workouts, "mi", "run");
    expect(result).toEqual([
      { mondayIso: "2026-04-20", miles: 13000 / 1609.344 },
      { mondayIso: "2026-04-27", miles: 10000 / 1609.344 },
    ]);
  });
  it("returns [] for no workouts", () => {
    expect(weeklyMileage([], "mi", "run")).toEqual([]);
  });
  it("works in km", () => {
    const workouts = [w("2026-04-20", 10000)];
    const result = weeklyMileage(workouts, "km", "run");
    expect(result[0].miles).toBeCloseTo(10);
  });
});

describe("computePlanStats", () => {
  it("totals, peak week, longest run, weeks count", () => {
    const workouts = [
      w("2026-04-20", 5000),
      w("2026-04-21", 8000),
      w("2026-04-27", 32000), // longest run, peak week
      w("2026-05-04", 6000),
    ];
    const stats = computePlanStats(workouts, "mi", "run");
    expect(stats.totalDistance).toBeCloseTo(51000 / 1609.344);
    expect(stats.peakWeek?.distance).toBeCloseTo(32000 / 1609.344);
    expect(stats.peakWeek?.mondayIso).toBe("2026-04-27");
    expect(stats.longestRun?.distance).toBeCloseTo(32000 / 1609.344);
    expect(stats.longestRun?.dateIso).toBe("2026-04-27");
    expect(stats.weeksCount).toBe(3);
  });
  it("handles empty plan", () => {
    const stats = computePlanStats([], "mi", "run");
    expect(stats).toEqual({
      totalDistance: 0,
      peakWeek: null,
      longestRun: null,
      weeksCount: 0,
    });
  });
  it("ignores null distance workouts (rest days)", () => {
    const workouts = [w("2026-04-20", null), w("2026-04-21", 5000)];
    const stats = computePlanStats(workouts, "mi", "run");
    expect(stats.totalDistance).toBeCloseTo(5000 / 1609.344);
    expect(stats.longestRun?.distance).toBeCloseTo(5000 / 1609.344);
  });
  it("counts the secondary (doubles) session in totals and peak week, not in longest run", () => {
    const double = {
      date: "2026-04-21",
      distance_meters: "8000",
      duration_seconds: null,
      sport: "run",
      type: "intervals",
      secondary: { type: "easy", distance_km: 5 },
    } as never;
    const workouts = [w("2026-04-20", 10000), double, w("2026-04-27", 12000)];
    const stats = computePlanStats(workouts, "km", "run");
    // 10 + 8 + 5 + 12
    expect(stats.totalDistance).toBeCloseTo(35);
    // Week of Apr 20: 10 + 8 + 5 = 23 > 12
    expect(stats.peakWeek?.distance).toBeCloseTo(23);
    expect(stats.peakWeek?.mondayIso).toBe("2026-04-20");
    // Longest single session is the 12 km, not the 13 km double day.
    expect(stats.longestRun?.distance).toBeCloseTo(12);
    expect(weeklyMileage(workouts, "km", "run")[0].miles).toBeCloseTo(23);
  });
  it("leaves the other sport out of a run plan's totals", () => {
    const ride = { ...(w("2026-04-22", 60000) as object), sport: "bike" } as never;
    // AM run with a PM spin: only the run counts.
    const runThenSpin = {
      ...(w("2026-04-24", 8000) as object),
      secondary: { type: "easy", sport: "bike", distance_km: 30 },
    } as never;
    const workouts = [w("2026-04-20", 10000), ride, runThenSpin];

    const stats = computePlanStats(workouts, "km", "run");
    expect(stats.totalDistance).toBeCloseTo(18);
    expect(stats.peakWeek?.distance).toBeCloseTo(18);
    // The 60 km ride is not the longest run.
    expect(stats.longestRun?.distance).toBeCloseTo(10);
  });
  it("counts rides, not runs, in a bike plan", () => {
    const ride = { ...(w("2026-04-22", 60000) as object), sport: "bike" } as never;
    const stats = computePlanStats([w("2026-04-20", 10000), ride], "km", "bike");
    expect(stats.totalDistance).toBeCloseTo(60);
  });
});
