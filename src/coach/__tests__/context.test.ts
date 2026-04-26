import { describe, it, expect } from "vitest";
import { renderContextPrefix, routeLabel } from "../context";

describe("routeLabel", () => {
  it("maps known routes to friendly labels", () => {
    expect(routeLabel("/today")).toMatch(/Today/);
    expect(routeLabel("/calendar")).toMatch(/Calendar/);
    expect(routeLabel("/plans")).toMatch(/Plans/);
    expect(routeLabel("/settings")).toMatch(/Settings/);
  });
  it("returns null for unknown / missing routes", () => {
    expect(routeLabel(undefined)).toBeNull();
    expect(routeLabel("/coach")).toBeNull();
    expect(routeLabel("/some/random/path")).toBeNull();
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
    expect(out).toContain("Coach notes:");
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
    expect(out).not.toContain("Coach notes:");
    expect(out).not.toContain("opened coach from:");
  });
});
