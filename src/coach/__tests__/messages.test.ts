import { describe, it, expect, vi, beforeEach } from "vitest";

const fromChain = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
};
const selectChain = { from: vi.fn(() => fromChain) };
const insertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};
const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };

vi.mock("@/db", () => ({
  db: {
    select: () => selectChain,
    insert: () => insertChain,
    delete: () => deleteChain,
  },
}));
vi.mock("@/db/schema", () => ({
  messages: {
    id: "id",
    user_id: "user_id",
    plan_id: "plan_id",
    role: "role",
    content: "content",
    created_at: "created_at",
  },
}));

import { loadHistory, appendMessage, clearMessages } from "../messages";

describe("loadHistory", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.orderBy.mockClear().mockReturnThis();
  });
  it("returns rows ordered by created_at asc", async () => {
    fromChain.orderBy.mockResolvedValueOnce([{ id: "m1" }, { id: "m2" }]);
    const out = await loadHistory("u1", null);
    expect(out).toEqual([{ id: "m1" }, { id: "m2" }]);
    expect(fromChain.where).toHaveBeenCalled();
    expect(fromChain.orderBy).toHaveBeenCalled();
  });
});

describe("appendMessage", () => {
  beforeEach(() => {
    insertChain.values.mockClear().mockReturnThis();
    insertChain.returning.mockReset();
  });
  it("inserts and returns new row", async () => {
    insertChain.returning.mockResolvedValueOnce([{ id: "m-new" }]);
    const out = await appendMessage("u1", "user", [{ type: "text", text: "hi" }]);
    expect(out.id).toBe("m-new");
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", role: "user" })
    );
  });
});

describe("clearMessages", () => {
  beforeEach(() => {
    deleteChain.where.mockClear().mockResolvedValue(undefined);
  });
  it("issues DELETE scoped to user", async () => {
    await clearMessages("u1", null);
    expect(deleteChain.where).toHaveBeenCalledOnce();
  });
});
