import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const loadHistoryMock = vi.fn();
const clearMessagesMock = vi.fn();
vi.mock("@/coach/messages", () => ({
  loadHistory: (...args: unknown[]) => loadHistoryMock(...args),
  clearMessages: (...args: unknown[]) => clearMessagesMock(...args),
}));

import { GET, DELETE } from "../route";

describe("GET /api/coach/messages", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    loadHistoryMock.mockReset();
  });

  it("returns 401 if not authed", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with messages for authed user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const fakeMessages = [{ role: "user", content: "hello" }];
    loadHistoryMock.mockResolvedValue(fakeMessages);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ messages: fakeMessages });
    expect(loadHistoryMock).toHaveBeenCalledWith("u1");
  });
});

describe("DELETE /api/coach/messages", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    clearMessagesMock.mockReset();
  });

  it("returns 401 if not authed", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("returns 204 for authed user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    clearMessagesMock.mockResolvedValue(undefined);
    const res = await DELETE();
    expect(res.status).toBe(204);
    expect(clearMessagesMock).toHaveBeenCalledWith("u1");
  });
});
