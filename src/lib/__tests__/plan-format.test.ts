import { describe, it, expect } from "vitest";
import { computeWeeksLeft, formatDuration } from "../plan-format";

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
