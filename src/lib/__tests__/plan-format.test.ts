import { describe, it, expect } from "vitest";
import { computeWeeksLeft, formatDuration, formatGoal, formatSport } from "../plan-format";

describe("computeWeeksLeft", () => {
  it("returns ceil of (end - today) / 7 days, never negative", () => {
    expect(computeWeeksLeft("2026-05-05", "2026-04-26")).toBe(2);
    expect(computeWeeksLeft("2026-04-26", "2026-04-26")).toBe(0);
    expect(computeWeeksLeft("2026-01-01", "2026-04-26")).toBe(0);
  });
  it("returns null when end_date is null", () => {
    expect(computeWeeksLeft(null, "2026-04-26")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("returns indefinite when end is null", () => {
    expect(formatDuration("2026-01-01", null)).toBe("indefinite");
  });
  it("returns weeks for goal plans, rounded", () => {
    expect(formatDuration("2026-01-01", "2026-04-23")).toBe("16 weeks");
    expect(formatDuration("2026-01-01", "2026-05-21")).toBe("20 weeks");
  });
});

describe("formatGoal", () => {
  it("formats target_time + race_date when present", () => {
    expect(formatGoal({ target_time: "3:05", race_date: "2026-05-05" })).toBe("Goal: 3:05 · May 5");
  });
  it("falls back to race_distance when no target_time", () => {
    expect(formatGoal({ race_distance: "marathon", race_date: "2026-05-05" })).toBe(
      "Goal: marathon · May 5"
    );
  });
  it("returns null when goal is null or empty", () => {
    expect(formatGoal(null)).toBeNull();
    expect(formatGoal({})).toBeNull();
  });
});

describe("formatSport", () => {
  it("renders run with shoe emoji", () => {
    expect(formatSport("run")).toBe("🏃 Run");
  });
  it("renders bike with bike emoji", () => {
    expect(formatSport("bike")).toBe("🚴 Bike");
  });
});
