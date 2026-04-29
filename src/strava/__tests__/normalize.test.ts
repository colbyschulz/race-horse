import { describe, it, expect } from "vitest";
import { normalizeActivity, normalizeLap } from "../normalize";
import type { StravaSummaryActivity, StravaDetailedActivity, StravaLap } from "../types";

const sample: StravaSummaryActivity = {
  id: 9999,
  name: "Easy run",
  type: "Run",
  start_date: "2026-04-25T15:00:00Z",
  distance: 8000,
  moving_time: 2400,
  elapsed_time: 2500,
  total_elevation_gain: 60,
  average_speed: 3.33,
  average_heartrate: 145,
  max_heartrate: 160,
};

describe("normalizeActivity", () => {
  it("maps required fields and converts speed → s/km pace", () => {
    const row = normalizeActivity(sample, "user-1");
    expect(row.userId).toBe("user-1");
    expect(row.strava_id).toBe(9999);
    expect(row.name).toBe("Easy run");
    expect(row.type).toBe("Run");
    expect(row.distance_meters).toBe("8000");
    expect(row.moving_time_seconds).toBe(2400);
    expect(row.elapsed_time_seconds).toBe(2500);
    expect(row.elevation_gain_m).toBe("60");
    expect(row.avg_hr).toBe("145");
    expect(row.max_hr).toBe("160");
    expect(row.start_date).toBeInstanceOf(Date);
    expect(row.start_date.toISOString()).toBe("2026-04-25T15:00:00.000Z");
    // 1000 / 3.33 ≈ 300.30
    expect(Number(row.avg_pace_seconds_per_km)).toBeCloseTo(300.3, 1);
    expect(row.raw).toEqual(sample);
  });

  it("leaves nullable fields null when absent", () => {
    const minimal: StravaSummaryActivity = {
      id: 1,
      name: "x",
      type: "Workout",
      start_date: "2026-04-01T00:00:00Z",
      distance: 0,
      moving_time: 0,
      elapsed_time: 0,
      total_elevation_gain: 0,
    };
    const row = normalizeActivity(minimal, "u");
    expect(row.avg_hr).toBeNull();
    expect(row.max_hr).toBeNull();
    expect(row.avg_pace_seconds_per_km).toBeNull();
    expect(row.avg_power_watts).toBeNull();
  });

  it("captures average_watts for rides", () => {
    const ride: StravaDetailedActivity = {
      ...sample,
      type: "Ride",
      average_watts: 220,
      device_watts: true,
    };
    const row = normalizeActivity(ride, "u");
    expect(row.avg_power_watts).toBe("220");
  });
});

describe("normalizeLap", () => {
  it("maps lap fields and pace conversion", () => {
    const lap: StravaLap = {
      id: 1,
      lap_index: 1,
      distance: 1000,
      moving_time: 300,
      elapsed_time: 305,
      average_speed: 3.33,
      average_heartrate: 150,
      max_heartrate: 165,
      total_elevation_gain: 5,
      start_index: 0,
      end_index: 600,
    };
    const row = normalizeLap(lap, "activity-uuid");
    expect(row.activity_id).toBe("activity-uuid");
    expect(row.lap_index).toBe(1);
    expect(row.distance_meters).toBe("1000");
    expect(row.moving_time_seconds).toBe(300);
    expect(Number(row.avg_pace_seconds_per_km)).toBeCloseTo(300.3, 1);
    expect(row.start_index).toBe(0);
    expect(row.end_index).toBe(600);
  });
});
