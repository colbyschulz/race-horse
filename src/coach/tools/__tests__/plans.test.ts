import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

vi.mock("@/plans/queries", () => ({
  listPlansWithCounts: vi.fn(),
  getPlanById: vi.fn(),
  createPlan: vi.fn(),
  setActivePlan: vi.fn(),
  archivePlan: vi.fn(),
}));

// Use vi.hoisted so variables are available at mock-factory evaluation time
const { mockSelect, mockInsert, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  get_active_plan_handler,
  list_plans_handler,
  get_plan_handler,
  create_plan_handler,
  update_workouts_handler,
  set_active_plan_handler,
  archive_plan_handler,
} from "../plans";

import {
  listPlansWithCounts,
  getPlanById,
  createPlan,
  setActivePlan,
  archivePlan,
} from "@/plans/queries";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = "user-123";
const PLAN_ID = "plan-abc";
const ctx = { userId: USER_ID };

function makePlan(overrides: object = {}) {
  return {
    id: PLAN_ID,
    userId: USER_ID,
    title: "Test Plan",
    sport: "run" as const,
    mode: "goal" as const,
    goal: null,
    start_date: "2026-01-01",
    end_date: null,
    is_active: true,
    source: "coach_generated" as const,
    source_file_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    // also resolve directly for calls without .limit()
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  };
  // make it thenable directly
  Object.defineProperty(chain, Symbol.toStringTag, { value: "Promise" });
  mockSelect.mockReturnValue(chain);
  return chain;
}

function buildDeleteChain() {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  mockDelete.mockReturnValue(chain);
  return chain;
}

function buildInsertChain() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
  };
  mockInsert.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("get_active_plan_handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null plan and empty workouts when no active plan", async () => {
    // First select (plans) returns empty
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    const result = await get_active_plan_handler({} as never, ctx);
    expect(result).toEqual({ plan: null, workouts: [] });
  });

  it("returns plan and workouts when active plan exists", async () => {
    const plan = makePlan();
    const workoutRows = [{ id: "w1", plan_id: PLAN_ID, date: "2026-01-01" }];

    // First call: select plans
    const plansChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([plan]),
    };
    // Second call: select workouts (no .limit)
    const workoutsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(workoutRows),
    };

    mockSelect
      .mockReturnValueOnce(plansChain)
      .mockReturnValueOnce(workoutsChain);

    const result = await get_active_plan_handler({} as never, ctx);
    expect(result.plan).toEqual(plan);
    expect(result.workouts).toEqual(workoutRows);
  });
});

describe("list_plans_handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls listPlansWithCounts with userId", async () => {
    const mockPlans = [makePlan()];
    vi.mocked(listPlansWithCounts).mockResolvedValue(mockPlans as never);

    const result = await list_plans_handler({} as never, ctx);

    expect(listPlansWithCounts).toHaveBeenCalledWith(USER_ID);
    expect(result).toEqual({ plans: mockPlans });
  });
});

describe("get_plan_handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns plan and workouts when plan belongs to user", async () => {
    const plan = makePlan();
    const workoutRows = [{ id: "w1", plan_id: PLAN_ID }];

    vi.mocked(getPlanById).mockResolvedValue(plan as never);

    const workoutsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(workoutRows),
    };
    mockSelect.mockReturnValue(workoutsChain);

    const result = await get_plan_handler({ plan_id: PLAN_ID }, ctx);

    expect(getPlanById).toHaveBeenCalledWith(PLAN_ID, USER_ID);
    expect(result.plan).toEqual(plan);
    expect(result.workouts).toEqual(workoutRows);
  });

  it("throws when plan not found", async () => {
    vi.mocked(getPlanById).mockResolvedValue(null);

    await expect(get_plan_handler({ plan_id: PLAN_ID }, ctx)).rejects.toThrow(
      "plan not found or not owned",
    );
  });

  it("throws when plan belongs to a different user", async () => {
    const plan = makePlan({ userId: "other-user" });
    vi.mocked(getPlanById).mockResolvedValue(plan as never);

    await expect(get_plan_handler({ plan_id: PLAN_ID }, ctx)).rejects.toThrow(
      "plan not found or not owned",
    );
  });
});

describe("create_plan_handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a plan and returns plan_id", async () => {
    const plan = makePlan({ is_active: false });
    vi.mocked(createPlan).mockResolvedValue(plan as never);

    const result = await create_plan_handler(
      { title: "Test Plan", sport: "run", mode: "goal", start_date: "2026-01-01" },
      ctx,
    );

    expect(createPlan).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ title: "Test Plan", sport: "run", source: "coach_generated" }),
    );
    expect(result).toEqual({ plan_id: PLAN_ID });
    expect(setActivePlan).not.toHaveBeenCalled();
  });

  it("calls setActivePlan when set_active is true", async () => {
    const plan = makePlan({ is_active: false });
    vi.mocked(createPlan).mockResolvedValue(plan as never);
    vi.mocked(setActivePlan).mockResolvedValue(undefined);

    await create_plan_handler(
      { title: "Test", sport: "bike", mode: "indefinite", start_date: "2026-01-01", set_active: true },
      ctx,
    );

    expect(setActivePlan).toHaveBeenCalledWith(PLAN_ID, USER_ID);
  });
});

describe("update_workouts_handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when plan not owned", async () => {
    vi.mocked(getPlanById).mockResolvedValue(null);

    await expect(
      update_workouts_handler({ plan_id: PLAN_ID, operations: [] }, ctx),
    ).rejects.toThrow("plan not found or not owned");
  });

  it("processes upsert operations (delete + insert)", async () => {
    const plan = makePlan();
    vi.mocked(getPlanById).mockResolvedValue(plan as never);

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const deleteFrom = vi.fn().mockReturnValue({ where: deleteWhere });
    mockDelete.mockReturnValue({ where: deleteWhere });

    const insertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
      // also make it thenable for plain insert
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
    });
    mockInsert.mockReturnValue({ values: insertValues });

    const result = await update_workouts_handler(
      {
        plan_id: PLAN_ID,
        operations: [
          { op: "upsert", date: "2026-03-01", workout: { type: "easy", distance_km: 10, duration_minutes: 60, notes: "easy run" } },
        ],
      },
      ctx,
    );

    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    expect(result).toEqual({ upserted: 1, deleted: 0 });
  });

  it("processes delete operations", async () => {
    const plan = makePlan();
    vi.mocked(getPlanById).mockResolvedValue(plan as never);

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: deleteWhere });

    const result = await update_workouts_handler(
      {
        plan_id: PLAN_ID,
        operations: [{ op: "delete", date: "2026-03-01" }],
      },
      ctx,
    );

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ upserted: 0, deleted: 1 });
  });
});

describe("set_active_plan_handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls setActivePlan with correct args", async () => {
    const plan = makePlan();
    vi.mocked(getPlanById).mockResolvedValue(plan as never);
    vi.mocked(setActivePlan).mockResolvedValue(undefined);

    const result = await set_active_plan_handler({ plan_id: PLAN_ID }, ctx);

    expect(getPlanById).toHaveBeenCalledWith(PLAN_ID, USER_ID);
    expect(setActivePlan).toHaveBeenCalledWith(PLAN_ID, USER_ID);
    expect(result).toEqual({ ok: true });
  });

  it("throws when plan not owned", async () => {
    vi.mocked(getPlanById).mockResolvedValue(null);

    await expect(set_active_plan_handler({ plan_id: PLAN_ID }, ctx)).rejects.toThrow(
      "plan not found or not owned",
    );
  });
});

describe("archive_plan_handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls archivePlan with correct args", async () => {
    const plan = makePlan();
    vi.mocked(getPlanById).mockResolvedValue(plan as never);
    vi.mocked(archivePlan).mockResolvedValue(undefined);

    const result = await archive_plan_handler({ plan_id: PLAN_ID }, ctx);

    expect(getPlanById).toHaveBeenCalledWith(PLAN_ID, USER_ID);
    expect(archivePlan).toHaveBeenCalledWith(PLAN_ID, USER_ID);
    expect(result).toEqual({ ok: true });
  });

  it("throws when plan not owned", async () => {
    vi.mocked(getPlanById).mockResolvedValue(null);

    await expect(archive_plan_handler({ plan_id: PLAN_ID }, ctx)).rejects.toThrow(
      "plan not found or not owned",
    );
  });
});
