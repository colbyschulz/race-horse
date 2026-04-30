import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/strava/queries", () => ({
  getAthleteSummary: vi.fn(),
  listRecentActivities: vi.fn(),
}));

import { getAthleteSummary, listRecentActivities } from "@/server/strava/queries";
import { fetchStravaPreload } from "../strava-preload";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchStravaPreload", () => {
  it("returns athlete_summary, recent_activities_summary, and minimal=false when 12-week count is healthy", async () => {
    vi.mocked(getAthleteSummary).mockResolvedValue({
      four_week: {
        count: 12,
        total_distance_meters: 100_000,
        total_moving_time_seconds: 30_000,
        by_type: {},
      },
      twelve_week: {
        count: 36,
        total_distance_meters: 300_000,
        total_moving_time_seconds: 90_000,
        by_type: {},
      },
      fifty_two_week: {
        count: 150,
        total_distance_meters: 1_200_000,
        total_moving_time_seconds: 360_000,
        by_type: {},
      },
    });
    vi.mocked(listRecentActivities).mockResolvedValue([
      {
        id: "a1",
        start_date: new Date("2026-04-20"),
        type: "Run",
        distance_meters: 10000,
        moving_time_seconds: 3000,
        avg_hr: 150,
        avg_pace_seconds_per_km: 300,
        avg_power_watts: null,
      },
    ]);

    const out = await fetchStravaPreload("u1");
    expect(out.minimal).toBe(false);
    expect(out.athlete_summary.twelve_week.count).toBe(36);
    expect(out.recent_activities_summary.count).toBe(1);
    expect(out.recent_activities_summary.total_distance_meters).toBe(10000);
    expect(listRecentActivities).toHaveBeenCalledWith("u1", 84);
  });

  it("flags minimal=true when 12-week count is below 4", async () => {
    vi.mocked(getAthleteSummary).mockResolvedValue({
      four_week: {
        count: 1,
        total_distance_meters: 5000,
        total_moving_time_seconds: 1500,
        by_type: {},
      },
      twelve_week: {
        count: 3,
        total_distance_meters: 15000,
        total_moving_time_seconds: 4500,
        by_type: {},
      },
      fifty_two_week: {
        count: 3,
        total_distance_meters: 15000,
        total_moving_time_seconds: 4500,
        by_type: {},
      },
    });
    vi.mocked(listRecentActivities).mockResolvedValue([]);

    const out = await fetchStravaPreload("u1");
    expect(out.minimal).toBe(true);
  });
});
