import { describe, it, expect } from "vitest";
import { renderContextPrefix, routeLabel } from "../context";

describe("routeLabel", () => {
  it("maps known routes to friendly labels", () => {
    expect(routeLabel("/today")).toMatch(/Today/);
    expect(routeLabel("/training")).toMatch(/Training/);
    expect(routeLabel("/plans")).toMatch(/Plans/);
    expect(routeLabel("/settings")).toMatch(/Settings/);
  });
  it("returns null for unknown / missing routes", () => {
    expect(routeLabel(undefined)).toBeNull();
    expect(routeLabel("/some/random/path")).toBeNull();
  });
  it("labels plan detail routes with the plan id", () => {
    expect(routeLabel("/plans/3f2c4a91-aa11-4cb1-9f2d-12345678abcd")).toBe(
      "Plan detail (plan id: 3f2c4a91-aa11-4cb1-9f2d-12345678abcd)"
    );
  });
  it("labels plan workout drill-in routes with id and date", () => {
    expect(routeLabel("/plans/3f2c4a91-aa11-4cb1-9f2d-12345678abcd/2026-05-04")).toBe(
      "Workout detail (plan id: 3f2c4a91-aa11-4cb1-9f2d-12345678abcd, date: 2026-05-04)"
    );
  });
  it("still labels static routes", () => {
    expect(routeLabel("/today")).toBe("Today view");
  });
});

describe("renderContextPrefix", () => {
  it("includes date, units, active plan, notes, and from-route", () => {
    const out = renderContextPrefix({
      today: "2026-04-26",
      units: "mi",
      activePlan: { title: "Boston Build", weeks_left: 8, workout_count: 84, completed: 46 },
      coachNotes: "Goal: sub-3:05 Boston. No injuries.",
      fromLabel: "Today view",
    });
    expect(out).toContain("2026-04-26");
    expect(out).toContain("mi");
    expect(out).toContain("Boston Build");
    expect(out).toContain("General coach notes:");
    expect(out).toContain("Goal: sub-3:05 Boston");
    expect(out).toContain("Today view");
  });

  it("omits sections that are empty", () => {
    const out = renderContextPrefix({
      today: "2026-04-26",
      units: "km",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
    });
    expect(out).not.toContain("Active plan:");
    expect(out).not.toContain("coach notes:");
    expect(out).not.toContain("opened coach from:");
  });
});

describe("renderContextPrefix planFile branch", () => {
  it("includes file-help block when planFile is provided", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: "Plans / manage page",
      planFile: {
        id: "f1",
        original_filename: "plan.pdf",
        status: "failed",
        extraction_error: "couldn't parse",
      },
    });
    expect(out).toContain("plan.pdf");
    expect(out).toContain("f1");
    expect(out).toContain("read_uploaded_file");
  });
  it("omits the block when planFile is null", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
    });
    expect(out).not.toContain("read_uploaded_file");
  });
});

describe("renderContextPrefix build branch", () => {
  it("includes Cold-start plan build flag when coldStartBuild is true", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
      coldStartBuild: true,
    });
    expect(out).toContain("Cold-start plan build: true");
  });

  it("omits Cold-start plan build line when flag is absent or false", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
    });
    expect(out).not.toContain("Cold-start plan build");
  });

  it("includes a Strava preload section when stravaPreload is provided", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
      coldStartBuild: true,
      stravaPreload: {
        athlete_summary: {
          four_week: {
            count: 1,
            total_distance_meters: 1,
            total_moving_time_seconds: 1,
            by_type: {},
          },
          twelve_week: {
            count: 5,
            total_distance_meters: 5,
            total_moving_time_seconds: 5,
            by_type: {},
          },
          fifty_two_week: {
            count: 10,
            total_distance_meters: 10,
            total_moving_time_seconds: 10,
            by_type: {},
          },
        },
        recent_activities_summary: {
          count: 5,
          total_distance_meters: 5,
          total_moving_time_seconds: 5,
        },
        minimal: false,
      },
    });
    expect(out).toContain("Strava preload");
    // JSON shape sanity-check (whitespace-tolerant)
    expect(out).toMatch(/"twelve_week"\s*:\s*\{[^}]*"count"\s*:\s*5/);
    expect(out).not.toContain("Strava history: minimal");
  });

  it("flags Strava history: minimal when the preload says so", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
      coldStartBuild: true,
      stravaPreload: {
        athlete_summary: {
          four_week: {
            count: 0,
            total_distance_meters: 0,
            total_moving_time_seconds: 0,
            by_type: {},
          },
          twelve_week: {
            count: 0,
            total_distance_meters: 0,
            total_moving_time_seconds: 0,
            by_type: {},
          },
          fifty_two_week: {
            count: 0,
            total_distance_meters: 0,
            total_moving_time_seconds: 0,
            by_type: {},
          },
        },
        recent_activities_summary: {
          count: 0,
          total_distance_meters: 0,
          total_moving_time_seconds: 0,
        },
        minimal: true,
      },
    });
    expect(out).toContain("Strava history: minimal");
  });
});
