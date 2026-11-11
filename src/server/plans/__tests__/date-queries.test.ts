import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mock chains ----------

const selectChain = {
  from: vi.fn(),
};

const fromChain = {
  innerJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
};

// select().from() returns fromChain
selectChain.from.mockReturnValue(fromChain);

vi.mock("@/server/db", () => ({
  db: {
    select: () => selectChain,
  },
}));

vi.mock("@/server/db/schema", () => ({
  plans: {
    id: "id",
    userId: "userId",
    is_active: "is_active",
  },
  workouts: {
    id: "id",
    plan_id: "plan_id",
    date: "date",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  gt: vi.fn(),
  asc: vi.fn(),
  getTableColumns: vi.fn((table: unknown) => table),
}));

import { eq, gt } from "drizzle-orm";

import { getActivePlan, getWorkoutsForDateRange, getNextWorkouts } from "../date-queries";

// Helper to reset all chains
function resetChains() {
  selectChain.from.mockReset().mockReturnValue(fromChain);
  fromChain.innerJoin.mockReset().mockReturnThis();
  fromChain.where.mockReset().mockReturnThis();
  fromChain.orderBy.mockReset().mockReturnThis();
  fromChain.limit.mockReset().mockReturnThis();
}

// ---------- getActivePlan ----------

describe("getActivePlan", () => {
  beforeEach(resetChains);

  it("returns null when db returns empty array", async () => {
    fromChain.limit.mockResolvedValueOnce([]);
    const result = await getActivePlan("u1");
    expect(result).toBeNull();
  });

  it("returns the row when one exists", async () => {
    const plan = { id: "p1", userId: "u1", is_active: true, title: "My Plan" };
    fromChain.limit.mockResolvedValueOnce([plan]);
    const result = await getActivePlan("u1");
    expect(result).toEqual(plan);
  });
});

// ---------- getWorkoutsForDateRange ----------

describe("getWorkoutsForDateRange", () => {
  beforeEach(resetChains);

  it("reads the active plan's workouts in a single joined query", async () => {
    const workoutRows = [
      { id: "w1", plan_id: "p1", date: "2026-04-10" },
      { id: "w2", plan_id: "p1", date: "2026-04-15" },
    ];
    fromChain.orderBy.mockResolvedValueOnce(workoutRows);

    const result = await getWorkoutsForDateRange("u1", "2026-04-01", "2026-04-30");

    expect(result).toEqual(workoutRows);
    expect(selectChain.from).toHaveBeenCalledTimes(1);
    expect(fromChain.innerJoin).toHaveBeenCalledTimes(1);
    // Scoped to this user's active plan.
    expect(eq).toHaveBeenCalledWith("userId", "u1");
    expect(eq).toHaveBeenCalledWith("is_active", true);
  });

  it("returns an empty array when the user has no active plan", async () => {
    fromChain.orderBy.mockResolvedValueOnce([]);
    const result = await getWorkoutsForDateRange("u1", "2026-04-01", "2026-04-30");
    expect(result).toEqual([]);
  });
});

// ---------- getNextWorkouts ----------

describe("getNextWorkouts", () => {
  beforeEach(resetChains);

  it("takes the next n workouts after today in a single joined query", async () => {
    const workoutRows = [{ id: "w1", plan_id: "p1", date: "2026-04-27" }];
    fromChain.limit.mockResolvedValueOnce(workoutRows);

    const result = await getNextWorkouts("u1", "2026-04-26", 3);

    expect(result).toEqual(workoutRows);
    expect(selectChain.from).toHaveBeenCalledTimes(1);
    expect(fromChain.innerJoin).toHaveBeenCalledTimes(1);
    expect(fromChain.limit).toHaveBeenCalledWith(3);
    expect(gt).toHaveBeenCalledWith("date", "2026-04-26");
    expect(eq).toHaveBeenCalledWith("userId", "u1");
    expect(eq).toHaveBeenCalledWith("is_active", true);
  });

  it("returns an empty array when the user has no active plan", async () => {
    fromChain.limit.mockResolvedValueOnce([]);
    const result = await getNextWorkouts("u1", "2026-04-26", 5);
    expect(result).toEqual([]);
  });
});

// ---------- getWorkoutsForPlan ----------

describe("getWorkoutsForPlan", () => {
  beforeEach(resetChains);

  it("returns rows for the given plan_id, ordered by date asc", async () => {
    const rows = [
      { id: "w1", plan_id: "p1", date: "2026-04-21", type: "easy" },
      { id: "w2", plan_id: "p1", date: "2026-04-22", type: "tempo" },
    ];
    fromChain.orderBy.mockResolvedValueOnce(rows);
    const { getWorkoutsForPlan } = await import("../date-queries");
    const result = await getWorkoutsForPlan("p1");
    expect(result).toEqual(rows);
    expect(eq).toHaveBeenCalledWith(expect.anything(), "p1");
  });
});
