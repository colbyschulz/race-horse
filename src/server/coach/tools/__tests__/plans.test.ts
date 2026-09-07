import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

vi.mock("@/server/plans/queries", () => ({
  listPlansWithCounts: vi.fn(),
  getPlanById: vi.fn(),
  createPlan: vi.fn(),
  setActivePlan: vi.fn(),
  archivePlan: vi.fn(),
}));

// Use vi.hoisted so variables are available at mock-factory evaluation time
const { mockSelect, mockInsert, mockDelete, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
    update: mockUpdate,
    transaction: <T>(cb: (tx: unknown) => Promise<T>) =>
      cb({ select: mockSelect, insert: mockInsert, delete: mockDelete, update: mockUpdate }),
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
} from "@/server/plans/queries";

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

    const result = await get_active_plan_handler({}, ctx);
    expect(result).toEqual({ plan: null, workouts: [], weekly_totals: [] });
  });

  it("returns plan and workouts (with day-of-week) when active plan exists", async () => {
    const plan = makePlan();
    const workoutRows = [
      { id: "w1", plan_id: PLAN_ID, date: "2026-01-01", type: "easy", distance_meters: "8000" },
    ];

    // First call: select plans
    const plansChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([plan]),
    };
    // Second call: select workouts (ordered)
    const workoutsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(workoutRows),
    };

    mockSelect.mockReturnValueOnce(plansChain).mockReturnValueOnce(workoutsChain);

    const result = await get_active_plan_handler({}, ctx);
    expect(result.plan).toEqual(plan);
    expect(result.workouts).toHaveLength(1);
    // 2026-01-01 is a Thursday — the coach verifies day placement from this.
    expect(result.workouts[0]).toMatchObject({ id: "w1", date: "2026-01-01", day: "Thu" });
    // No `today` in ctx → whole plan.
    expect(result.window?.note).toBe("All workouts returned.");
  });

  it("includes secondary (doubles) distance in weekly_totals", async () => {
    const plan = makePlan();
    const workoutRow = {
      id: "w1",
      plan_id: PLAN_ID,
      date: "2026-06-03",
      type: "easy",
      distance_meters: "8000",
      duration_seconds: null,
      notes: "",
      secondary: { type: "easy", distance_km: 3 },
    };

    const plansChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([plan]),
    };
    const workoutsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([workoutRow]),
    };
    mockSelect.mockReturnValueOnce(plansChain).mockReturnValueOnce(workoutsChain);

    const result = await get_active_plan_handler({} as never, ctx);

    // 8km primary + 3km secondary = 11km, not just the primary's 8km.
    expect(result.weekly_totals).toEqual([
      { week_start: "2026-06-01", total_mi: 6.8, total_km: 11 },
    ]);
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
    const workoutRows = [{ id: "w1", plan_id: PLAN_ID, date: "2026-01-01", type: "easy" }];

    vi.mocked(getPlanById).mockResolvedValue(plan as never);

    const workoutsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(workoutRows),
    };
    mockSelect.mockReturnValue(workoutsChain);

    const result = await get_plan_handler({ plan_id: PLAN_ID }, ctx);

    expect(getPlanById).toHaveBeenCalledWith(PLAN_ID, USER_ID);
    expect(result.plan).toEqual(plan);
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]).toMatchObject({ id: "w1", date: "2026-01-01", day: "Thu" });
  });

  it("defaults to a window around today but keeps whole-plan weekly totals", async () => {
    const plan = makePlan();
    const workoutRows = [
      { id: "w1", plan_id: PLAN_ID, date: "2026-01-05", type: "easy", distance_meters: "10000" },
      { id: "w2", plan_id: PLAN_ID, date: "2026-03-05", type: "long", distance_meters: "20000" },
    ];
    vi.mocked(getPlanById).mockResolvedValue(plan as never);
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(workoutRows),
    });

    const result = await get_plan_handler({ plan_id: PLAN_ID }, { ...ctx, today: "2026-03-01" });

    // Default window: 14 days back through 28 days ahead of today.
    expect(result.window).toMatchObject({
      from: "2026-02-15",
      to: "2026-03-29",
      workouts_in_window: 1,
      total_workouts: 2,
    });
    expect(result.workouts.map((w) => w.id)).toEqual(["w2"]);
    // Weekly totals still span the whole plan.
    expect(result.weekly_totals.map((w) => w.week_start)).toEqual(["2026-01-05", "2026-03-02"]);
  });

  it("honours an explicit from/to window", async () => {
    const plan = makePlan();
    const workoutRows = [
      { id: "w1", plan_id: PLAN_ID, date: "2026-01-05", type: "easy", distance_meters: "10000" },
      { id: "w2", plan_id: PLAN_ID, date: "2026-03-05", type: "long", distance_meters: "20000" },
    ];
    vi.mocked(getPlanById).mockResolvedValue(plan as never);
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(workoutRows),
    });

    const result = await get_plan_handler(
      { plan_id: PLAN_ID, from: "2026-01-01", to: "2026-01-31" },
      { ...ctx, today: "2026-03-01" }
    );
    expect(result.workouts.map((w) => w.id)).toEqual(["w1"]);
    expect(result.window).toMatchObject({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("includes secondary (doubles) distance in weekly_totals", async () => {
    const plan = makePlan();
    const workoutRow = {
      id: "w1",
      plan_id: PLAN_ID,
      date: "2026-06-03",
      type: "easy",
      distance_meters: "8000",
      duration_seconds: null,
      notes: "",
      secondary: { type: "easy", distance_km: 3 },
    };

    vi.mocked(getPlanById).mockResolvedValue(plan as never);

    const workoutsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([workoutRow]),
    };
    mockSelect.mockReturnValue(workoutsChain);

    const result = await get_plan_handler({ plan_id: PLAN_ID }, ctx);

    // 8km primary + 3km secondary = 11km, not just the primary's 8km.
    expect(result.weekly_totals).toEqual([
      { week_start: "2026-06-01", total_mi: 6.8, total_km: 11 },
    ]);
  });

  it("throws when plan not found", async () => {
    vi.mocked(getPlanById).mockResolvedValue(null);

    await expect(get_plan_handler({ plan_id: PLAN_ID }, ctx)).rejects.toThrow(
      "plan not found or not owned"
    );
  });

  it("throws when plan belongs to a different user", async () => {
    const plan = makePlan({ userId: "other-user" });
    vi.mocked(getPlanById).mockResolvedValue(plan as never);

    await expect(get_plan_handler({ plan_id: PLAN_ID }, ctx)).rejects.toThrow(
      "plan not found or not owned"
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
      ctx
    );

    expect(createPlan).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ title: "Test Plan", sport: "run", source: "coach_generated" })
    );
    expect(result).toEqual({ plan_id: PLAN_ID });
    expect(setActivePlan).not.toHaveBeenCalled();
  });

  it("calls setActivePlan when set_active is true", async () => {
    const plan = makePlan({ is_active: false });
    vi.mocked(createPlan).mockResolvedValue(plan as never);
    vi.mocked(setActivePlan).mockResolvedValue(undefined);

    await create_plan_handler(
      {
        title: "Test",
        sport: "bike",
        mode: "indefinite",
        start_date: "2026-01-01",
        set_active: true,
      },
      ctx
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
      update_workouts_handler({ plan_id: PLAN_ID, operations: [] }, ctx)
    ).rejects.toThrow("plan not found or not owned");
  });

  /** Wires select (existing-row lookup), delete, insert, update mocks for one op. */
  function wireWriteMocks(existingRows: unknown[]) {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(existingRows),
    });
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const insertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
    });
    mockInsert.mockReturnValue({ values: insertValues });
    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockUpdate.mockReturnValue({ set: updateSet });
    return { insertValues, updateSet };
  }

  it("processes upsert operations (delete + insert) and echoes the day-of-week", async () => {
    const plan = makePlan();
    vi.mocked(getPlanById).mockResolvedValue(plan as never);
    wireWriteMocks([]);

    const result = await update_workouts_handler(
      {
        plan_id: PLAN_ID,
        operations: [
          {
            op: "upsert",
            date: "2026-03-01",
            workout: { type: "easy", distance_km: 10, duration_minutes: 60, notes: "easy run" },
          },
        ],
      },
      ctx
    );

    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    // 2026-03-01 is a Sunday.
    expect(result).toEqual({
      upserted: 1,
      deleted: 0,
      week_number: undefined,
      total_weeks: undefined,
      days: [{ date: "2026-03-01", day: "Sun", type: "easy", secondary: null }],
    });
  });

  it("keeps an existing second session when the upsert omits `secondary`", async () => {
    const plan = makePlan();
    vi.mocked(getPlanById).mockResolvedValue(plan as never);
    const existingSecondary = { type: "easy", distance_km: 5, notes: "PM shakeout" };
    const { insertValues } = wireWriteMocks([
      {
        id: "w1",
        plan_id: PLAN_ID,
        date: "2026-03-01",
        type: "intervals",
        secondary: existingSecondary,
      },
    ]);

    const result = await update_workouts_handler(
      {
        plan_id: PLAN_ID,
        operations: [
          { op: "upsert", date: "2026-03-01", workout: { type: "tempo", distance_km: 12 } },
        ],
      },
      ctx
    );

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tempo", secondary: existingSecondary })
    );
    expect(result.days[0]).toMatchObject({ type: "tempo", secondary: "easy" });
  });

  it("removes the second session when the upsert passes `secondary: null`", async () => {
    const plan = makePlan();
    vi.mocked(getPlanById).mockResolvedValue(plan as never);
    const { insertValues } = wireWriteMocks([
      {
        id: "w1",
        plan_id: PLAN_ID,
        date: "2026-03-01",
        type: "intervals",
        secondary: { type: "easy", distance_km: 5 },
      },
    ]);

    await update_workouts_handler(
      {
        plan_id: PLAN_ID,
        operations: [
          { op: "upsert", date: "2026-03-01", workout: { type: "tempo" }, secondary: null },
        ],
      },
      ctx
    );

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ secondary: null }));
  });

  it("set_secondary updates only the second session in place", async () => {
    const plan = makePlan();
    vi.mocked(getPlanById).mockResolvedValue(plan as never);
    const { updateSet } = wireWriteMocks([
      { id: "w1", plan_id: PLAN_ID, date: "2026-03-01", type: "intervals", secondary: null },
    ]);

    const result = await update_workouts_handler(
      {
        plan_id: PLAN_ID,
        operations: [
          {
            op: "set_secondary",
            date: "2026-03-01",
            secondary: { type: "recovery", distance_km: 4, notes: "PM easy" },
          },
        ],
      },
      ctx
    );

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith({
      secondary: {
        type: "recovery",
        distance_km: 4,
        duration_minutes: undefined,
        notes: "PM easy",
      },
    });
    expect(result.days[0]).toMatchObject({ type: "intervals", secondary: "recovery" });
  });

  it("set_secondary on an empty day is skipped with a warning", async () => {
    const plan = makePlan();
    vi.mocked(getPlanById).mockResolvedValue(plan as never);
    wireWriteMocks([]);

    const result = await update_workouts_handler(
      {
        plan_id: PLAN_ID,
        operations: [{ op: "set_secondary", date: "2026-03-01", secondary: { type: "easy" } }],
      },
      ctx
    );

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.upserted).toBe(0);
    expect(result.warnings?.[0]).toMatch(/no primary workout/);
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
      ctx
    );

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      upserted: 0,
      deleted: 1,
      week_number: undefined,
      total_weeks: undefined,
      days: [],
    });
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
      "plan not found or not owned"
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
      "plan not found or not owned"
    );
  });
});
