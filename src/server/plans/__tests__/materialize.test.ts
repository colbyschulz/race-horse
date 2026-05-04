// src/plans/__tests__/materialize.test.ts
import { describe, it, expect } from "vitest";
import { materializeWorkouts, computeEndDate } from "../materialize";

const wk = (day_offset: number, distance_meters: number | null = 5000) => ({
  day_offset,
  sport: "run" as const,
  type: "easy" as const,
  distance_meters,
  duration_seconds: null,
  target_intensity: null,
  intervals: null,
  notes: "",
  secondary: null,
});

describe("materializeWorkouts", () => {
  it("computes absolute dates from start_date + day_offset", () => {
    const result = materializeWorkouts("2026-05-04", [wk(0), wk(1), wk(7)]);
    expect(result.map((r) => r.date)).toEqual(["2026-05-04", "2026-05-05", "2026-05-11"]);
  });
  it("preserves null distance + populates other fields", () => {
    const [r] = materializeWorkouts("2026-05-04", [wk(0, null)]);
    expect(r.distance_meters).toBeNull();
    expect(r.sport).toBe("run");
    expect(r.type).toBe("easy");
  });
  it("handles empty array", () => {
    expect(materializeWorkouts("2026-05-04", [])).toEqual([]);
  });
});

describe("computeEndDate", () => {
  it("returns max date among materialized workouts", () => {
    const ws = materializeWorkouts("2026-05-04", [wk(0), wk(13), wk(7)]);
    expect(computeEndDate(ws)).toBe("2026-05-17");
  });
  it("returns the start date for a single workout", () => {
    const ws = materializeWorkouts("2026-05-04", [wk(0)]);
    expect(computeEndDate(ws)).toBe("2026-05-04");
  });
  it("throws on empty input (caller must check)", () => {
    expect(() => computeEndDate([])).toThrow();
  });
});
