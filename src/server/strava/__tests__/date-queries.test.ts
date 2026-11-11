import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mock chains ----------

const selectChain = {
  from: vi.fn(),
};

const fromChain = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
};

// select().from() returns fromChain
selectChain.from.mockReturnValue(fromChain);

vi.mock("@/server/db", () => ({
  db: {
    select: () => selectChain,
  },
}));

vi.mock("@/server/db/schema", () => ({
  activities: {
    id: "id",
    userId: "userId",
    start_date: "start_date",
    type: "type",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ type: "eq", val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  gte: vi.fn((col, bound) => ({ type: "gte", col, bound })),
  lt: vi.fn((col, bound) => ({ type: "lt", col, bound })),
  asc: vi.fn(),
  // Render a tagged template to plain text, marking each parameter, so tests
  // can read the SQL that was built.
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((out, part, i) => out + part + (i < values.length ? `<${values[i]}>` : ""), "")
  ),
}));

import { getActivitiesForDateRange } from "../date-queries";

// Helper to reset all chains
function resetChains() {
  selectChain.from.mockReset().mockReturnValue(fromChain);
  fromChain.where.mockReset().mockReturnThis();
  fromChain.orderBy.mockReset().mockReturnThis();
}

// ---------- getActivitiesForDateRange ----------

describe("getActivitiesForDateRange", () => {
  beforeEach(resetChains);

  it("passes through returned rows", async () => {
    const rows = [
      {
        id: "a1",
        userId: "u1",
        start_date: new Date("2026-04-20T10:00:00Z"),
        type: "Run",
      },
      {
        id: "a2",
        userId: "u1",
        start_date: new Date("2026-04-21T08:00:00Z"),
        type: "Run",
      },
    ];
    fromChain.orderBy.mockResolvedValueOnce(rows);

    const result = await getActivitiesForDateRange("u1", "2026-04-20", "2026-04-21");

    expect(result).toEqual(rows);
  });

  it("calls with correct userId filter", async () => {
    fromChain.orderBy.mockResolvedValueOnce([]);

    await getActivitiesForDateRange("user-abc", "2026-01-01", "2026-01-07");

    expect(fromChain.where).toHaveBeenCalled();
    // Verify eq was called with userId column and the userId value
    const { eq } = await import("drizzle-orm");
    expect(eq).toHaveBeenCalledWith("userId", "user-abc");
  });

  it("returns empty array when no activities in range", async () => {
    fromChain.orderBy.mockResolvedValueOnce([]);

    const result = await getActivitiesForDateRange("u1", "2026-01-01", "2026-01-07");

    expect(result).toEqual([]);
  });

  it("bounds the range by the athlete's local midnights, not UTC days", async () => {
    fromChain.orderBy.mockResolvedValueOnce([]);

    await getActivitiesForDateRange("u1", "2026-04-20", "2026-04-21", "America/Los_Angeles");

    const { gte, lt } = await import("drizzle-orm");
    expect(gte).toHaveBeenCalledWith(
      "start_date",
      "(<2026-04-20>::date::timestamp AT TIME ZONE <America/Los_Angeles>)"
    );
    // Exclusive upper bound at the midnight after the last day.
    expect(lt).toHaveBeenCalledWith(
      "start_date",
      "((<2026-04-21>::date + 1)::timestamp AT TIME ZONE <America/Los_Angeles>)"
    );
  });

  it("falls back to UTC days when no timezone is given", async () => {
    fromChain.orderBy.mockResolvedValueOnce([]);

    await getActivitiesForDateRange("u1", "2026-04-20", "2026-04-20");

    const { gte } = await import("drizzle-orm");
    expect(gte).toHaveBeenCalledWith(
      "start_date",
      "(<2026-04-20>::date::timestamp AT TIME ZONE <UTC>)"
    );
  });
});
