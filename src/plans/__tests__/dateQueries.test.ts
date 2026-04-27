import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mock chains ----------

const selectChain = {
  from: vi.fn(),
};

const fromChain = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
};

// select().from() returns fromChain
selectChain.from.mockReturnValue(fromChain);

vi.mock("@/db", () => ({
  db: {
    select: () => selectChain,
  },
}));

vi.mock("@/db/schema", () => ({
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
}));

import { eq } from "drizzle-orm";

import {
  getActivePlan,
  getWorkoutsForDateRange,
  getNextWorkouts,
} from "../dateQueries";

// Helper to reset all chains
function resetChains() {
  selectChain.from.mockReset().mockReturnValue(fromChain);
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

  it("returns empty array when no active plan", async () => {
    fromChain.limit.mockResolvedValueOnce([]);
    const result = await getWorkoutsForDateRange("u1", "2026-04-01", "2026-04-30");
    expect(result).toEqual([]);
  });

  it("returns rows when active plan exists", async () => {
    const plan = { id: "p1", userId: "u1", is_active: true };
    const workoutRows = [
      { id: "w1", plan_id: "p1", date: "2026-04-10" },
      { id: "w2", plan_id: "p1", date: "2026-04-15" },
    ];
    // First call: getActivePlan -> limit resolves
    fromChain.limit.mockResolvedValueOnce([plan]);
    // Second call: workouts query -> orderBy resolves
    fromChain.orderBy.mockResolvedValueOnce(workoutRows);

    const result = await getWorkoutsForDateRange("u1", "2026-04-01", "2026-04-30");
    expect(result).toEqual(workoutRows);
    expect(fromChain.where).toHaveBeenCalled();
    expect(fromChain.orderBy).toHaveBeenCalled();
  });
});

// ---------- getNextWorkouts ----------

describe("getNextWorkouts", () => {
  beforeEach(resetChains);

  it("returns empty when no active plan", async () => {
    fromChain.limit.mockResolvedValueOnce([]);
    const result = await getNextWorkouts("u1", "2026-04-26", 5);
    expect(result).toEqual([]);
  });

  it("calls limit(n) and uses gt filter", async () => {
    const plan = { id: "p1", userId: "u1", is_active: true };
    const workoutRows = [{ id: "w1", plan_id: "p1", date: "2026-04-27" }];

    // First call: getActivePlan -> limit resolves with plan
    fromChain.limit
      .mockResolvedValueOnce([plan])
      // Second call: getNextWorkouts -> limit(n) resolves with workouts
      .mockResolvedValueOnce(workoutRows);

    const result = await getNextWorkouts("u1", "2026-04-26", 3);
    expect(result).toEqual(workoutRows);
    // limit should be called twice: once with 1 (getActivePlan), once with n=3
    expect(fromChain.limit).toHaveBeenCalledWith(3);
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
    const { getWorkoutsForPlan } = await import("../dateQueries");
    const result = await getWorkoutsForPlan("p1");
    expect(result).toEqual(rows);
    expect(eq).toHaveBeenCalledWith(expect.anything(), "p1");
  });
});
