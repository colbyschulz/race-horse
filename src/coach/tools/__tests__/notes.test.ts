import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const { mockUpdate } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    update: mockUpdate,
  },
}));

vi.mock("@/db/schema", () => ({
  users: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { update_coach_notes_handler } from "../notes";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const CTX = { userId: "user-123" };

describe("update_coach_notes_handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
  });

  it("saves content and returns { ok: true, bytes: N }", async () => {
    const content = "Coach notes here.";
    const result = await update_coach_notes_handler({ content }, CTX);
    expect(result).toEqual({ ok: true, bytes: content.length });
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it("throws when content exceeds 4096 chars", async () => {
    const content = "x".repeat(4097);
    await expect(update_coach_notes_handler({ content }, CTX)).rejects.toThrow(
      "content exceeds 4096 chars",
    );
  });

  it("throws when content is not a string", async () => {
    // Cast to bypass TS type checking for test purposes
    await expect(
      update_coach_notes_handler({ content: 42 as unknown as string }, CTX),
    ).rejects.toThrow("content must be string");
  });

  it("accepts content exactly 4096 chars", async () => {
    const content = "x".repeat(4096);
    const result = await update_coach_notes_handler({ content }, CTX);
    expect(result).toEqual({ ok: true, bytes: 4096 });
  });
});
