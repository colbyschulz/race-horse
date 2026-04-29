// src/coach/tools/__tests__/files.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getPlanFileById, fetchPlanFileBytes } = vi.hoisted(() => ({
  getPlanFileById: vi.fn(),
  fetchPlanFileBytes: vi.fn(),
}));

vi.mock("@/plans/files", () => ({ getPlanFileById }));
vi.mock("@/extraction/blob", () => ({ fetchPlanFileBytes }));

import { read_uploaded_file_handler } from "../files";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("read_uploaded_file_handler", () => {
  it("rejects when row is missing or not owned", async () => {
    getPlanFileById.mockResolvedValueOnce(null);
    const result = await read_uploaded_file_handler({ plan_file_id: "f1" }, { userId: "u1" });
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("returns content blocks for PDF", async () => {
    getPlanFileById.mockResolvedValueOnce({
      id: "f1",
      userId: "u1",
      blob_url: "https://blob/x",
      original_filename: "plan.pdf",
      mime_type: "application/pdf",
    });
    fetchPlanFileBytes.mockResolvedValueOnce(new Uint8Array([0x25, 0x50]).buffer);
    const result = await read_uploaded_file_handler({ plan_file_id: "f1" }, { userId: "u1" });
    expect(result.content[0]).toMatchObject({
      type: "document",
      source: { type: "base64", media_type: "application/pdf" },
    });
  });

  it("returns text content for markdown", async () => {
    getPlanFileById.mockResolvedValueOnce({
      id: "f1",
      userId: "u1",
      blob_url: "https://blob/x",
      original_filename: "plan.md",
      mime_type: "text/markdown",
    });
    fetchPlanFileBytes.mockResolvedValueOnce(new TextEncoder().encode("# Plan\nWeek 1").buffer);
    const result = await read_uploaded_file_handler({ plan_file_id: "f1" }, { userId: "u1" });
    expect(result.content[0]).toMatchObject({ type: "text" });
  });
});
