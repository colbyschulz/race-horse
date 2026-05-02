import { describe, it, expect } from "vitest";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatPaceRange,
  formatIntervalDistance,
  formatIntervalSummary,
  metersToUnits,
} from "../format";

describe("metersToUnits", () => {
  it("converts to miles", () => {
    expect(metersToUnits(1609.344, "mi")).toBeCloseTo(1, 6);
  });
  it("converts to km", () => {
    expect(metersToUnits(1000, "km")).toBe(1);
  });
});

describe("formatDistance", () => {
  it("returns null for null/undefined", () => {
    expect(formatDistance(null, "mi")).toBeNull();
    expect(formatDistance(undefined, "mi")).toBeNull();
  });
  it("returns null for non-finite strings", () => {
    expect(formatDistance("nope", "mi")).toBeNull();
  });
  it("formats meters → miles with 1 decimal by default", () => {
    expect(formatDistance(8046.72, "mi")).toBe("5.0");
  });
  it("formats meters → km with 1 decimal", () => {
    expect(formatDistance(5000, "km")).toBe("5.0");
  });
  it("accepts numeric strings", () => {
    expect(formatDistance("12701.6", "km")).toBe("12.7");
  });
  it("supports custom decimals", () => {
    expect(formatDistance(12701.6, "mi", { decimals: 2 })).toBe("7.89");
  });
  it("appends unit when withUnit:true", () => {
    expect(formatDistance(5000, "km", { withUnit: true })).toBe("5.0 km");
    expect(formatDistance(8046.72, "mi", { withUnit: true })).toBe("5.0 mi");
  });
});

describe("formatDuration", () => {
  it("returns null for missing or zero", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
  it("formats compact under 1h as Xm", () => {
    expect(formatDuration(45 * 60)).toBe("45m");
  });
  it("formats compact 1h+ as Xh Ym", () => {
    expect(formatDuration(3600 + 5 * 60)).toBe("1h 5m");
  });
  it("formats clock under 1h as M:SS", () => {
    expect(formatDuration(125, { format: "clock" })).toBe("2:05");
  });
  it("formats clock 1h+ as H:MM:SS", () => {
    expect(formatDuration(3725, { format: "clock" })).toBe("1:02:05");
  });
});

describe("formatPace", () => {
  it("formats sec/km in km units", () => {
    expect(formatPace(330, "km")).toBe("5:30");
  });
  it("converts to sec/mi when units=mi", () => {
    // 360 sec/km × 1.609344 ≈ 579.36 → rounded 579 → 9:39
    expect(formatPace(360, "mi")).toBe("9:39");
  });
});

describe("formatPaceRange", () => {
  it("returns null when neither bound provided", () => {
    expect(formatPaceRange({}, "km")).toBeNull();
  });
  it("returns single pace when only min", () => {
    expect(formatPaceRange({ min_seconds_per_km: 330 }, "km")).toBe("5:30");
  });
  it("returns single pace when only max", () => {
    expect(formatPaceRange({ max_seconds_per_km: 360 }, "km")).toBe("6:00");
  });
  it("returns range when both", () => {
    expect(formatPaceRange({ min_seconds_per_km: 330, max_seconds_per_km: 360 }, "km")).toBe(
      "5:30–6:00"
    );
  });
});

describe("formatIntervalDistance", () => {
  it('display_unit "m" → integer meters with m suffix', () => {
    expect(formatIntervalDistance(1600, "m", "mi")).toBe("1600m");
    expect(formatIntervalDistance(400, "m", "mi")).toBe("400m");
  });
  it('display_unit "km" → integer km with km suffix', () => {
    expect(formatIntervalDistance(1000, "km", "mi")).toBe("1km");
    expect(formatIntervalDistance(5000, "km", "mi")).toBe("5km");
  });
  it('display_unit "mi" → miles rounded to nearest 1/8', () => {
    expect(formatIntervalDistance(1609.344, "mi", "mi")).toBe("1 mi");
    expect(formatIntervalDistance(804.672, "mi", "mi")).toBe("0.5 mi");
  });
  it("no display_unit, multiple of 1000 → km heuristic", () => {
    expect(formatIntervalDistance(3000, undefined, "mi")).toBe("3km");
    expect(formatIntervalDistance(1000, undefined, "mi")).toBe("1km");
  });
  it("no display_unit, multiple of 100 (not 1000) → meters heuristic", () => {
    expect(formatIntervalDistance(1600, undefined, "mi")).toBe("1600m");
    expect(formatIntervalDistance(800, undefined, "mi")).toBe("800m");
  });
  it("no display_unit, non-round value → user units fallback", () => {
    // 1500m is divisible by 100 → meters
    expect(formatIntervalDistance(1500, undefined, "mi")).toBe("1500m");
    // 1750m is divisible by 50 but not 100 → user units
    expect(formatIntervalDistance(1750, undefined, "mi")).toBe("1.1 mi");
    expect(formatIntervalDistance(1750, undefined, "km")).toBe("1.8 km");
  });
});

describe("formatIntervalSummary", () => {
  it("returns null for empty array", () => {
    expect(formatIntervalSummary([], "mi")).toBeNull();
  });
  it("uses display_unit when present", () => {
    const result = formatIntervalSummary(
      [{ reps: 5, distance_m: 1600, display_unit: "m" }],
      "mi"
    );
    expect(result).toBe("5 × 1600m");
  });
  it("falls back to heuristic when display_unit absent", () => {
    const result = formatIntervalSummary(
      [{ reps: 10, distance_m: 1000 }],
      "mi"
    );
    expect(result).toBe("10 × 1km");
  });
  it("includes pace range when present", () => {
    const result = formatIntervalSummary(
      [{ reps: 5, distance_m: 1600, display_unit: "m", target_intensity: { pace: { min_seconds_per_km: 234, max_seconds_per_km: 240 } } }],
      "mi"
    );
    expect(result).toBe("5 × 1600m @ 6:17–6:26");
  });
});
