import { describe, it, expect, vi } from "vitest";

// renderRecentTraining is pure; mock the DB-backed imports so the module loads without a DATABASE_URL.
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/strava/date-queries", () => ({ getActivitiesForDateRange: vi.fn() }));

import { renderRecentTraining, type RecentTraining } from "../recent-training";

const base: RecentTraining = {
  from: "2026-08-24",
  to: "2026-09-07",
  lookahead_to: "2026-09-14",
  sport: "run",
  planned: [
    // Mon Aug 24 — easy 8 km, done
    {
      date: "2026-08-24",
      type: "easy",
      distance_meters: "8000",
      duration_seconds: null,
      notes: "",
      secondary: null,
    },
    // Tue Aug 25 — intervals + PM double, missed entirely
    {
      date: "2026-08-25",
      type: "intervals",
      distance_meters: "10000",
      duration_seconds: null,
      notes: "6 × 1 km",
      secondary: { type: "easy", distance_km: 4, notes: "PM shakeout" },
    },
    // Sun Sep 6 — long run, came in short
    {
      date: "2026-09-06",
      type: "long",
      distance_meters: "30000",
      duration_seconds: null,
      notes: "",
      secondary: null,
    },
    // Tue Sep 8 — future
    {
      date: "2026-09-08",
      type: "tempo",
      distance_meters: "12000",
      duration_seconds: null,
      notes: "",
      secondary: null,
    },
  ],
  actual: [
    {
      date: "2026-08-24",
      name: "Morning Run",
      type: "Run",
      distance_meters: 8100,
      moving_time_seconds: 2700,
      avg_pace_seconds_per_km: 333,
      avg_hr: 142,
      matched: true,
    },
    {
      date: "2026-09-06",
      name: "Long-ish",
      type: "Run",
      distance_meters: 22000,
      moving_time_seconds: 6600,
      avg_pace_seconds_per_km: 300,
      avg_hr: 151,
      matched: false,
    },
    // A ride on an unplanned day — counted as "actual" but not toward run compliance.
    {
      date: "2026-08-27",
      name: "Spin",
      type: "Ride",
      distance_meters: 30000,
      moving_time_seconds: 3600,
      avg_pace_seconds_per_km: null,
      avg_hr: 120,
      matched: false,
    },
  ],
};

describe("renderRecentTraining", () => {
  it("renders one line per day with planned vs actual, doubles, and a compliance summary", () => {
    const out = renderRecentTraining(base, "km");
    const lines = out.split("\n");

    // 15 past days + 7 future days, plus header + summary
    expect(lines).toHaveLength(2 + 15 + 7);

    // Summary: planned 8 + 10 + 4 (double) + 30 = 52 km; completed runs 8.1 + 22 = 30.1 km
    expect(lines[1]).toContain("planned 52.0 km");
    expect(lines[1]).toContain("completed 30.1 km");
    expect(lines[1]).toContain("(58%)");

    expect(out).toContain(
      '2026-08-24 Mon | planned: easy 8.0 km | actual: Run "Morning Run", 8.1 km, 45m, 5:33/km, HR 142'
    );
    expect(out).toContain(
      "2026-08-25 Tue | planned: intervals 10.0 km + PM easy 4.0 km | actual: none"
    );
    expect(out).toContain(
      '2026-08-27 Thu | planned: rest | actual: Ride "Spin", 30.0 km, 1h 0m, HR 120'
    );
    expect(out).toContain("2026-09-07 Mon (today) | planned: rest | actual: nothing yet");
    // Future days show planned only.
    expect(out).toContain("2026-09-08 Tue | planned: tempo 12.0 km");
    expect(out).not.toContain("2026-09-08 Tue | planned: tempo 12.0 km | actual");
  });

  it("converts to miles when the athlete uses mi", () => {
    const out = renderRecentTraining(base, "mi");
    expect(out).toContain("2026-08-24 Mon | planned: easy 5.0 mi");
    expect(out).toContain("8:56/mi");
  });

  it("omits the percentage when nothing was planned", () => {
    const out = renderRecentTraining({ ...base, planned: [] }, "km");
    expect(out.split("\n")[1]).not.toContain("%");
  });
});
