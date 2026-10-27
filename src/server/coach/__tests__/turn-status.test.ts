import { describe, it, expect, vi, beforeEach } from "vitest";

const insertChain = { values: vi.fn(), onConflictDoUpdate: vi.fn() };
const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(() => insertChain),
    select: vi.fn(() => selectChain),
  },
}));

vi.mock("@/server/db/schema", () => ({
  coachTurns: {
    user_id: "user_id",
    plan_id: "plan_id",
    status: "status",
    error_message: "error_message",
    started_at: "started_at",
    updated_at: "updated_at",
  },
}));

import { upsertTurnStatus, getTurnStatus } from "../turn-status";

beforeEach(() => {
  insertChain.values.mockReturnValue(insertChain);
  insertChain.onConflictDoUpdate.mockReset().mockResolvedValue(undefined);
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);
  selectChain.limit.mockReset();
});

describe("upsertTurnStatus", () => {
  it("targets the (user_id, plan_id) partial index when planId is set", async () => {
    await upsertTurnStatus("u1", "p1", "running");
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", plan_id: "p1", status: "running" })
    );
    const call = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(call.target).toEqual(["user_id", "plan_id"]);
    expect(call.set).toEqual(expect.objectContaining({ status: "running", error_message: null }));
  });

  it("targets the (user_id)-only partial index when planId is null", async () => {
    await upsertTurnStatus("u1", null, "running");
    const call = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(call.target).toEqual(["user_id"]);
  });

  it("does not reset started_at when transitioning to done", async () => {
    await upsertTurnStatus("u1", "p1", "done");
    const call = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(call.set.status).toBe("done");
    expect(call.set.started_at).toBeUndefined();
  });

  it("stores the error message when transitioning to error", async () => {
    await upsertTurnStatus("u1", "p1", "error", "boom");
    const call = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(call.set.error_message).toBe("boom");
  });
});

describe("getTurnStatus", () => {
  it("returns null when no row exists", async () => {
    selectChain.limit.mockResolvedValue([]);
    expect(await getTurnStatus("u1", "p1")).toBeNull();
  });

  it("returns the row when one exists", async () => {
    const row = { status: "running", error_message: null, started_at: new Date("2026-01-01") };
    selectChain.limit.mockResolvedValue([row]);
    expect(await getTurnStatus("u1", null)).toEqual(row);
  });
});
