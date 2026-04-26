import { describe, it, expect, vi, beforeEach } from "vitest";

const fromChain = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
};
const selectChain = {
  from: vi.fn(() => fromChain),
};
const insertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};
const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};
const deleteChain = {
  where: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/db", () => ({
  db: {
    select: () => selectChain,
    insert: () => insertChain,
    update: () => updateChain,
    delete: () => deleteChain,
  },
}));
vi.mock("@/db/schema", () => ({
  plans: { id: "id", userId: "userId", is_active: "is_active", start_date: "start_date" },
  workouts: { id: "id", plan_id: "plan_id", date: "date" },
}));

import { listPlans, getPlanById, createPlan } from "../queries";

describe("listPlans", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.orderBy.mockClear().mockReturnThis();
  });

  it("returns plans for the user, active first then by start_date desc", async () => {
    const rows = [
      { id: "p1", userId: "u1", is_active: true, start_date: "2026-01-01" },
      { id: "p2", userId: "u1", is_active: false, start_date: "2025-09-01" },
    ];
    fromChain.orderBy.mockResolvedValueOnce(rows);
    const result = await listPlans("u1");
    expect(result).toEqual(rows);
    expect(fromChain.where).toHaveBeenCalled();
    expect(fromChain.orderBy).toHaveBeenCalled();
  });
});

describe("getPlanById", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.limit.mockClear().mockReturnThis();
  });

  it("returns the plan when ownership matches", async () => {
    fromChain.limit.mockResolvedValueOnce([{ id: "p1", userId: "u1" }]);
    const result = await getPlanById("p1", "u1");
    expect(result).toEqual({ id: "p1", userId: "u1" });
  });

  it("returns null when no row", async () => {
    fromChain.limit.mockResolvedValueOnce([]);
    const result = await getPlanById("p-missing", "u1");
    expect(result).toBeNull();
  });
});

describe("createPlan", () => {
  beforeEach(() => {
    insertChain.values.mockClear().mockReturnThis();
    insertChain.returning.mockReset();
  });

  it("inserts and returns the row", async () => {
    insertChain.returning.mockResolvedValueOnce([
      { id: "p-new", userId: "u1", title: "Boston", sport: "run" },
    ]);
    const out = await createPlan("u1", {
      title: "Boston",
      sport: "run",
      mode: "goal",
      start_date: "2026-01-01",
      end_date: "2026-04-20",
      source: "coach_generated",
    });
    expect(out.id).toBe("p-new");
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        title: "Boston",
        sport: "run",
        mode: "goal",
        is_active: false,
      }),
    );
  });

  it("throws when insert returns no rows", async () => {
    insertChain.returning.mockResolvedValueOnce([]);
    await expect(
      createPlan("u1", {
        title: "x",
        sport: "run",
        mode: "indefinite",
        start_date: "2026-01-01",
        source: "coach_generated",
      }),
    ).rejects.toThrow("createPlan: no row returned");
  });
});
