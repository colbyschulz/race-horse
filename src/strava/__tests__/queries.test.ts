import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mock chains ----------

const selectChain = {
  from: vi.fn(),
};

const fromChain = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  groupBy: vi.fn().mockReturnThis(),
};

// select().from() returns fromChain
selectChain.from.mockReturnValue(fromChain);

vi.mock("@/db", () => ({
  db: {
    select: () => selectChain,
  },
}));

vi.mock("@/db/schema", () => ({
  activities: {
    id: "id",
    userId: "userId",
    start_date: "start_date",
    type: "type",
    distance_meters: "distance_meters",
    moving_time_seconds: "moving_time_seconds",
    avg_hr: "avg_hr",
    avg_pace_seconds_per_km: "avg_pace_seconds_per_km",
    avg_power_watts: "avg_power_watts",
  },
  activityLaps: {
    id: "id",
    activity_id: "activity_id",
    lap_index: "lap_index",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  desc: vi.fn(),
  sql: new Proxy(
    (..._args: unknown[]) => "sql-fragment",
    { get: (_t, p) => p === "raw" ? () => "sql-fragment" : undefined },
  ),
}));

import {
  listRecentActivities,
  getActivityWithLaps,
  getAthleteSummary,
} from "../queries";

// Helper to reset all chains
function resetChains() {
  selectChain.from.mockReset().mockReturnValue(fromChain);
  fromChain.where.mockReset().mockReturnThis();
  fromChain.orderBy.mockReset().mockReturnThis();
  fromChain.limit.mockReset().mockReturnThis();
  fromChain.groupBy.mockReset().mockReturnThis();
}

// ---------- listRecentActivities ----------

describe("listRecentActivities", () => {
  beforeEach(resetChains);

  it("returns mapped list from DB", async () => {
    const dbRows = [
      {
        id: "a1",
        start_date: new Date("2026-04-20T10:00:00Z"),
        type: "Run",
        distance_meters: "10000",
        moving_time_seconds: 3600,
        avg_hr: "145",
        avg_pace_seconds_per_km: "360",
        avg_power_watts: null,
      },
    ];
    fromChain.orderBy.mockResolvedValueOnce(dbRows);

    const result = await listRecentActivities("u1", 7);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "a1",
      start_date: new Date("2026-04-20T10:00:00Z"),
      type: "Run",
      distance_meters: 10000,
      moving_time_seconds: 3600,
      avg_hr: 145,
      avg_pace_seconds_per_km: 360,
      avg_power_watts: null,
    });
    expect(fromChain.where).toHaveBeenCalled();
    expect(fromChain.orderBy).toHaveBeenCalled();
  });

  it("returns empty array when no activities", async () => {
    fromChain.orderBy.mockResolvedValueOnce([]);
    const result = await listRecentActivities("u1", 30);
    expect(result).toEqual([]);
  });
});

// ---------- getActivityWithLaps ----------

describe("getActivityWithLaps", () => {
  beforeEach(resetChains);

  it("returns activity and laps when activity belongs to user", async () => {
    const activity = {
      id: "a1",
      userId: "u1",
      type: "Run",
      start_date: new Date("2026-04-20T10:00:00Z"),
      name: "Morning run",
      strava_id: 123456,
      distance_meters: "10000",
      moving_time_seconds: 3600,
      elapsed_time_seconds: 3700,
      avg_hr: "145",
      max_hr: "165",
      avg_pace_seconds_per_km: "360",
      avg_power_watts: null,
      elevation_gain_m: "50",
      raw: {},
      created_at: new Date(),
      updated_at: new Date(),
    };
    const laps = [
      { id: "l1", activity_id: "a1", lap_index: 0 },
      { id: "l2", activity_id: "a1", lap_index: 1 },
    ];

    // First call: activity lookup (limit resolves)
    fromChain.limit.mockResolvedValueOnce([activity]);
    // Second call: laps lookup (orderBy resolves)
    fromChain.orderBy.mockResolvedValueOnce(laps);

    const result = await getActivityWithLaps("u1", "a1");

    expect(result).not.toBeNull();
    expect(result!.activity).toEqual(activity);
    expect(result!.laps).toEqual(laps);
  });

  it("returns null when activity not found", async () => {
    fromChain.limit.mockResolvedValueOnce([]);

    const result = await getActivityWithLaps("u1", "missing");
    expect(result).toBeNull();
  });
});

// ---------- getAthleteSummary ----------

describe("getAthleteSummary", () => {
  beforeEach(resetChains);

  it("returns correctly shaped rollups for all three windows", async () => {
    const makeRows = (multiplier: number) => [
      {
        type: "Run",
        count: 10 * multiplier,
        distance: 100000 * multiplier,
        moving_time: 36000 * multiplier,
      },
      {
        type: "Ride",
        count: 5 * multiplier,
        distance: 200000 * multiplier,
        moving_time: 72000 * multiplier,
      },
    ];

    // getAthleteSummary fires 3 parallel queries, each goes through groupBy
    fromChain.groupBy
      .mockResolvedValueOnce(makeRows(1))  // 4-week
      .mockResolvedValueOnce(makeRows(3))  // 12-week
      .mockResolvedValueOnce(makeRows(13)); // 52-week

    const result = await getAthleteSummary("u1");

    // four_week
    expect(result.four_week.count).toBe(15);
    expect(result.four_week.total_distance_meters).toBe(300000);
    expect(result.four_week.total_moving_time_seconds).toBe(108000);
    expect(result.four_week.by_type["Run"]).toEqual({
      count: 10,
      distance_meters: 100000,
      moving_time_seconds: 36000,
    });

    // twelve_week count = (10+5)*3 = 45
    expect(result.twelve_week.count).toBe(45);

    // fifty_two_week count = (10+5)*13 = 195
    expect(result.fifty_two_week.count).toBe(195);
  });

  it("returns zero rollup when no activities", async () => {
    fromChain.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getAthleteSummary("u1");
    expect(result.four_week).toEqual({
      count: 0,
      total_distance_meters: 0,
      total_moving_time_seconds: 0,
      by_type: {},
    });
  });
});
