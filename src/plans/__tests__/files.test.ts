// src/plans/__tests__/files.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fromChain = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
};
const selectChain = { from: vi.fn(() => fromChain) };
const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn() };
const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };

vi.mock("@/db", () => ({
  db: {
    select: () => selectChain,
    insert: () => insertChain,
    update: () => updateChain,
    delete: () => deleteChain,
  },
}));
vi.mock("@/db/schema", () => ({
  planFiles: {
    id: "id",
    userId: "userId",
    status: "status",
    extracted_plan_id: "extracted_plan_id",
    created_at: "created_at",
  },
}));

import {
  createPlanFile,
  getPlanFileById,
  listInFlightPlanFiles,
  updatePlanFileStatus,
  setExtractedPayload,
  setExtractedPlanId,
  deletePlanFile,
} from "../files";

describe("createPlanFile", () => {
  beforeEach(() => {
    insertChain.values.mockClear().mockReturnThis();
    insertChain.returning.mockClear();
  });
  it("inserts a row with the provided id and returns it", async () => {
    const row = { id: "f1", userId: "u1", status: "extracting" };
    insertChain.returning.mockResolvedValueOnce([row]);
    const result = await createPlanFile({
      id: "f1",
      userId: "u1",
      blob_url: "https://blob/x",
      original_filename: "plan.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
    });
    expect(result).toEqual(row);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: "f1", userId: "u1", status: "extracting" }),
    );
  });
});

describe("getPlanFileById", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.limit.mockClear();
  });
  it("returns null when not found", async () => {
    fromChain.limit.mockResolvedValueOnce([]);
    expect(await getPlanFileById("f1", "u1")).toBeNull();
  });
  it("returns the row when found", async () => {
    const row = { id: "f1", userId: "u1" };
    fromChain.limit.mockResolvedValueOnce([row]);
    expect(await getPlanFileById("f1", "u1")).toEqual(row);
  });
});

describe("listInFlightPlanFiles", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.orderBy.mockClear();
  });
  it("returns rows where extracted_plan_id IS NULL, newest first", async () => {
    const rows = [{ id: "f2" }, { id: "f1" }];
    fromChain.orderBy.mockResolvedValueOnce(rows);
    expect(await listInFlightPlanFiles("u1")).toEqual(rows);
  });
});

describe("updatePlanFileStatus", () => {
  beforeEach(() => {
    updateChain.set.mockClear().mockReturnThis();
    updateChain.where.mockClear().mockResolvedValue(undefined);
  });
  it("updates status + optional error", async () => {
    await updatePlanFileStatus("f1", "u1", "failed", "boom");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", extraction_error: "boom" }),
    );
  });
});

describe("setExtractedPayload", () => {
  it("writes payload + status=extracted", async () => {
    await setExtractedPayload("f1", "u1", { is_training_plan: true });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "extracted", extracted_payload: { is_training_plan: true } }),
    );
  });
});

describe("setExtractedPlanId", () => {
  it("links plan id", async () => {
    await setExtractedPlanId("f1", "u1", "p1");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ extracted_plan_id: "p1" }),
    );
  });
});

describe("deletePlanFile", () => {
  it("deletes scoped to user", async () => {
    await deletePlanFile("f1", "u1");
    expect(deleteChain.where).toHaveBeenCalled();
  });
});
