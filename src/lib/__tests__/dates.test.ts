import { describe, it, expect } from "vitest";
import {
  mondayOf,
  addDays,
  formatWeekLabel,
  formatDayLabel,
  formatLongDate,
  formatDateShort,
  formatDateMedium,
  formatDateRange,
  weekIndexFromStart,
  todayIso,
  parseIso,
} from "../dates";

describe("mondayOf", () => {
  it("returns the Monday of the same week (Sun → previous Mon)", () => {
    expect(mondayOf("2026-04-26")).toBe("2026-04-20"); // Sun → previous Mon
  });
  it("Mon → same Mon", () => {
    expect(mondayOf("2026-04-20")).toBe("2026-04-20");
  });
  it("Wed → previous Mon", () => {
    expect(mondayOf("2026-04-22")).toBe("2026-04-20");
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
  });
  it("subtracts with negative", () => {
    expect(addDays("2026-05-01", -1)).toBe("2026-04-30");
  });
  it("crosses year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("formatWeekLabel", () => {
  it("labels a same-month week", () => {
    expect(formatWeekLabel("2026-04-20")).toBe("Apr 20–26");
  });
  it("labels a cross-month week", () => {
    expect(formatWeekLabel("2026-04-27")).toBe("Apr 27–May 3");
  });
});

describe("formatDayLabel", () => {
  it("returns 'Mon 20' format", () => {
    expect(formatDayLabel("2026-04-20")).toBe("Mon 20");
  });
});

describe("formatLongDate", () => {
  it("returns 'Friday, April 24'", () => {
    expect(formatLongDate("2026-04-24")).toBe("Friday, April 24");
  });
});

describe("parseIso / round-trip", () => {
  it("parses then re-formats", () => {
    expect(addDays(parseIso("2026-04-26"), 0)).toBe("2026-04-26");
  });
});

describe("todayIso", () => {
  it("returns YYYY-MM-DD", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatDateShort", () => {
  it("returns 'Apr 27'", () => {
    expect(formatDateShort("2026-04-27")).toBe("Apr 27");
  });
});

describe("formatDateMedium", () => {
  it("returns 'Apr 27, 2026'", () => {
    expect(formatDateMedium("2026-04-27")).toBe("Apr 27, 2026");
  });
});

describe("formatDateRange", () => {
  it("renders both dates when end is present", () => {
    expect(formatDateRange("2026-04-27", "2026-05-30")).toBe("Apr 27, 2026 – May 30, 2026");
  });
  it("renders ongoing when end is null", () => {
    expect(formatDateRange("2026-04-27", null)).toBe("Apr 27, 2026 · ongoing");
  });
});

describe("weekIndexFromStart", () => {
  it("returns 1 on the plan's first Monday", () => {
    expect(weekIndexFromStart("2026-04-20", "2026-04-20")).toBe(1);
  });
  it("returns 1 when the date is mid-first-week", () => {
    // first Monday is 2026-04-20; queried week is also that Monday
    expect(weekIndexFromStart("2026-04-22", "2026-04-20")).toBe(1);
  });
  it("returns 2 a week later", () => {
    expect(weekIndexFromStart("2026-04-20", "2026-04-27")).toBe(2);
  });
  it("returns 4 three weeks later", () => {
    expect(weekIndexFromStart("2026-04-20", "2026-05-11")).toBe(4);
  });
});
