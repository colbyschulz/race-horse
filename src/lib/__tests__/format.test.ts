import { describe, it, expect } from "vitest";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatPaceRange,
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
    expect(formatPaceRange({ min_seconds_per_km: 330, max_seconds_per_km: 360 }, "km")).toBe("5:30–6:00");
  });
});
