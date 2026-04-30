import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/server/strava/queries", () => ({
  listRecentActivities: vi.fn(),
  getActivityWithLaps: vi.fn(),
  getAthleteSummary: vi.fn(),
}));

const { mockSelect, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  get_recent_activities_handler,
  get_activity_laps_handler,
  update_activity_match_handler,
  get_athlete_summary_handler,
} from "../activities";

import { listRecentActivities, getActivityWithLaps, getAthleteSummary } from "@/server/strava/queries";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = "user-abc";
const ACTIVITY_ID = "activity-123";
const WORKOUT_ID = "workout-456";
const ctx = { userId: USER_ID };

function makeActivity(overrides: object = {}) {
  return {
    id: ACTIVITY_ID,
    userId: USER_ID,
    strava_id: 99999,
    start_date: new Date("2026-01-10"),
    type: "run",
    distance_meters: 10000,
    moving_time_seconds: 3600,
    avg_hr: 150,
    avg_pace_seconds_per_km: 360,
    avg_power_watts: null,
    ...overrides,
  };
}

function makeLap(idx: number) {
  return {
    id: `lap-${idx}`,
    activity_id: ACTIVITY_ID,
    lap_index: idx,
    distance_meters: 1000,
    moving_time_seconds: 360,
    elapsed_time_seconds: 365,
    avg_pace_seconds_per_km: 360,
    avg_power_watts: null,
    avg_hr: 148,
    max_hr: 160,
    elevation_gain_m: null,
    start_index: null,
    end_index: null,
  };
}

function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

function buildUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  mockUpdate.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("get_recent_activities_handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns activities and summary with default 14 days", async () => {
    const rows = [
      makeActivity(),
      makeActivity({ id: "a2", distance_meters: 5000, moving_time_seconds: 1800 }),
    ];
    vi.mocked(listRecentActivities).mockResolvedValue(rows as never);

    const result = await get_recent_activities_handler({}, ctx);

    expect(listRecentActivities).toHaveBeenCalledWith(USER_ID, 14);
    expect(result.activities).toEqual(rows);
    expect(result.summary.count).toBe(2);
    expect(result.summary.total_distance_meters).toBe(15000);
    expect(result.summary.total_moving_time_seconds).toBe(5400);
  });

  it("passes custom days to listRecentActivities", async () => {
    vi.mocked(listRecentActivities).mockResolvedValue([]);

    await get_recent_activities_handler({ days: 7 }, ctx);

    expect(listRecentActivities).toHaveBeenCalledWith(USER_ID, 7);
  });

  it("handles null distance/time gracefully in summary", async () => {
    const rows = [makeActivity({ distance_meters: null, moving_time_seconds: null })];
    vi.mocked(listRecentActivities).mockResolvedValue(rows as never);

    const result = await get_recent_activities_handler({}, ctx);

    expect(result.summary.total_distance_meters).toBe(0);
    expect(result.summary.total_moving_time_seconds).toBe(0);
  });
});

describe("get_activity_laps_handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns activity and laps when found", async () => {
    const activity = makeActivity();
    const laps = [makeLap(0), makeLap(1)];
    vi.mocked(getActivityWithLaps).mockResolvedValue({ activity, laps } as never);

    const result = await get_activity_laps_handler({ activity_id: ACTIVITY_ID }, ctx);

    expect(getActivityWithLaps).toHaveBeenCalledWith(USER_ID, ACTIVITY_ID);
    expect(result!.activity).toEqual(activity);
    expect(result!.laps).toEqual(laps);
  });

  it("throws when activity not found", async () => {
    vi.mocked(getActivityWithLaps).mockResolvedValue(null);

    await expect(get_activity_laps_handler({ activity_id: ACTIVITY_ID }, ctx)).rejects.toThrow(
      `activity not found: ${ACTIVITY_ID}`
    );
  });
});

describe("update_activity_match_handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links activity to workout and returns ok", async () => {
    // First select: activity ownership check
    const activityChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: ACTIVITY_ID, userId: USER_ID }]),
    };
    // Second select: workout ownership check
    const workoutChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: WORKOUT_ID }]),
    };
    mockSelect.mockReturnValueOnce(activityChain).mockReturnValueOnce(workoutChain);

    buildUpdateChain();

    const result = await update_activity_match_handler(
      { activity_id: ACTIVITY_ID, workout_id: WORKOUT_ID },
      ctx
    );

    expect(mockUpdate).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("unlinks activity (workout_id null) without workout ownership check", async () => {
    const activityChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: ACTIVITY_ID, userId: USER_ID }]),
    };
    mockSelect.mockReturnValueOnce(activityChain);
    buildUpdateChain();

    const result = await update_activity_match_handler(
      { activity_id: ACTIVITY_ID, workout_id: null },
      ctx
    );

    // select should only be called once (no workout check)
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  it("throws when activity not owned", async () => {
    const activityChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValueOnce(activityChain);

    await expect(
      update_activity_match_handler({ activity_id: ACTIVITY_ID, workout_id: WORKOUT_ID }, ctx)
    ).rejects.toThrow("activity not found or not owned");
  });

  it("throws when workout not owned", async () => {
    const activityChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: ACTIVITY_ID, userId: USER_ID }]),
    };
    const workoutChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValueOnce(activityChain).mockReturnValueOnce(workoutChain);

    await expect(
      update_activity_match_handler({ activity_id: ACTIVITY_ID, workout_id: WORKOUT_ID }, ctx)
    ).rejects.toThrow("workout not found or not owned");
  });
});

describe("get_athlete_summary_handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rollup from getAthleteSummary", async () => {
    const summary = {
      four_week: {
        count: 5,
        total_distance_meters: 50000,
        total_moving_time_seconds: 18000,
        by_type: { run: { count: 5, distance_meters: 50000, moving_time_seconds: 18000 } },
      },
      twelve_week: {
        count: 15,
        total_distance_meters: 150000,
        total_moving_time_seconds: 54000,
        by_type: {},
      },
      fifty_two_week: {
        count: 52,
        total_distance_meters: 520000,
        total_moving_time_seconds: 187200,
        by_type: {},
      },
    };
    vi.mocked(getAthleteSummary).mockResolvedValue(summary);

    const result = await get_athlete_summary_handler({} as never, ctx);

    expect(getAthleteSummary).toHaveBeenCalledWith(USER_ID);
    expect(result).toEqual(summary);
  });
});
