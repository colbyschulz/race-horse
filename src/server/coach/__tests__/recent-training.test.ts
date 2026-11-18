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
      sport: "run" as const,
      type: "easy",
      distance_meters: "8000",
      duration_seconds: null,
      notes: "",
      secondary: null,
    },
    // Tue Aug 25 — intervals + PM double, missed entirely
    {
      date: "2026-08-25",
      sport: "run" as const,
      type: "intervals",
      distance_meters: "10000",
      duration_seconds: null,
      notes: "6 × 1 km",
      secondary: { type: "easy", distance_km: 4, notes: "PM shakeout" },
    },
    // Sun Sep 6 — long run, came in short
    {
      date: "2026-09-06",
      sport: "run" as const,
      type: "long",
      distance_meters: "30000",
      duration_seconds: null,
      notes: "",
      secondary: null,
    },
    // Tue Sep 8 — future
    {
      date: "2026-09-08",
      sport: "run" as const,
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

    // 15 past days + 7 future days, plus the header and a summary per sport
    // (the unplanned Strava ride gives rides a line of their own).
    expect(lines).toHaveLength(3 + 15 + 7);
    expect(lines[2]).toBe("Last 14 days (bike): planned 0.0 km, completed 30.0 km");

    // Summary: planned 8 + 10 + 4 (double) + 30 = 52 km; completed runs 8.1 + 22 = 30.1 km
    expect(lines[1]).toContain("planned 52.0 km");
    expect(lines[1]).toContain("completed 30.1 km");
    expect(lines[1]).toContain("(58%)");

    expect(out).toContain(
      '2026-08-24 Mon | planned: easy 8.0 km | actual: Run "Morning Run", 8.1 km, 45m, 5:33/km, HR 142'
    );
    expect(out).toContain(
      "2026-08-25 Tue | planned: intervals 10.0 km [6 × 1 km] + PM easy 4.0 km | actual: none"
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

  it("shows session details for hard sessions only, shortened and on one line", () => {
    const longNotes = `3 × 12 min @ threshold,\n90 sec float. ${"x".repeat(200)}`;
    const out = renderRecentTraining(
      {
        ...base,
        planned: [
          {
            date: "2026-08-24",
            sport: "run" as const,
            type: "easy",
            distance_meters: "8000",
            duration_seconds: null,
            notes: "Keep it relaxed",
            secondary: null,
          },
          {
            date: "2026-08-25",
            sport: "run" as const,
            type: "threshold",
            distance_meters: "12000",
            duration_seconds: null,
            notes: longNotes,
            secondary: null,
          },
        ],
      },
      "km"
    );

    expect(out).toContain("2026-08-24 Mon | planned: easy 8.0 km | actual:");
    expect(out).not.toContain("Keep it relaxed");
    const line = out.split("\n").find((l) => l.startsWith("2026-08-25"));
    expect(line).toContain("[3 × 12 min @ threshold, 90 sec float. x");
    expect(line).toContain("…]");
    expect(line).not.toContain("x".repeat(200));
  });

  it("names a planned ride in a run plan and keeps it out of the completion percentage", () => {
    const ride = {
      date: "2026-08-29",
      sport: "bike" as const,
      type: "long",
      distance_meters: "100000",
      duration_seconds: null,
      notes: "Steady endurance",
      secondary: null,
    };
    const runThenSpin = {
      date: "2026-08-26",
      sport: "run" as const,
      type: "easy",
      distance_meters: "5000",
      duration_seconds: null,
      notes: "",
      secondary: { type: "easy" as const, sport: "bike" as const, distance_km: 20 },
    };
    const out = renderRecentTraining(
      { ...base, planned: [...base.planned, ride, runThenSpin] },
      "km"
    );

    // The base 52 km plus the 5 km easy run; neither ride counts as running.
    expect(out.split("\n")[1]).toContain("planned 57.0 km");
    expect(out).toContain("2026-08-29 Sat | planned: bike long 100.0 km [Steady endurance]");
    expect(out).toContain("2026-08-26 Wed | planned: easy 5.0 km + PM bike easy 20.0 km");
  });

  it("counts a walk or swim toward neither sport, and gives no ride line without rides", () => {
    const out = renderRecentTraining(
      {
        ...base,
        actual: [
          ...base.actual.filter((a) => a.type !== "Ride"),
          {
            date: "2026-08-28",
            name: "Dog walk",
            type: "Walk",
            distance_meters: 6000,
            moving_time_seconds: 4000,
            avg_pace_seconds_per_km: null,
            avg_hr: 95,
            matched: false,
          },
        ],
      },
      "km"
    );
    const [, runSummary, next] = out.split("\n");
    expect(runSummary).toContain("completed 30.1 km");
    expect(next).not.toContain("(bike)");
  });

  it("omits the percentage when nothing was planned", () => {
    const out = renderRecentTraining({ ...base, planned: [] }, "km");
    expect(out.split("\n")[1]).not.toContain("%");
  });
});
