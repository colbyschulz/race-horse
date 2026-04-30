import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => mockAuth() }));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/server/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/server/db/schema", () => ({
  users: { id: "id", coach_notes: "coach_notes" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ col: a, val: b }),
}));

import { GET, PUT } from "../route";

describe("GET /api/coach/notes", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
  });

  it("returns 401 if not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 200 with content when authenticated", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ coach_notes: "my notes" }]),
        }),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe("my notes");
  });

  it("returns empty string when no rows found", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe("");
  });
});

describe("PUT /api/coach/notes", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
  });

  it("returns 401 if not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request("http://test/api/coach/notes", {
      method: "PUT",
      body: JSON.stringify({ content: "hello" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 if content is not a string", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const req = new Request("http://test/api/coach/notes", {
      method: "PUT",
      body: JSON.stringify({ content: 123 }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("content required");
  });

  it("returns 400 if content missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const req = new Request("http://test/api/coach/notes", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 if content exceeds 4096 chars", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const req = new Request("http://test/api/coach/notes", {
      method: "PUT",
      body: JSON.stringify({ content: "a".repeat(4097) }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("content exceeds 4096 chars");
  });

  it("returns 200 ok on happy path", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockUpdate.mockReturnValue({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    });
    const req = new Request("http://test/api/coach/notes", {
      method: "PUT",
      body: JSON.stringify({ content: "updated notes" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
