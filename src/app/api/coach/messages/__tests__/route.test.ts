import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => mockAuth() }));

const loadHistoryMock = vi.fn();
const clearMessagesMock = vi.fn();
vi.mock("@/server/coach/messages", () => ({
  loadHistory: (...args: unknown[]) => loadHistoryMock(...args),
  clearMessages: (...args: unknown[]) => clearMessagesMock(...args),
}));

import { GET, DELETE } from "../route";
import { NextRequest } from "next/server";

function makeReq(planId?: string) {
  const url = planId
    ? `http://localhost/api/coach/messages?plan_id=${planId}`
    : "http://localhost/api/coach/messages";
  return new NextRequest(url);
}

describe("GET /api/coach/messages", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    loadHistoryMock.mockReset();
  });

  it("returns 401 if not authed", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 200 with messages for authed user (no plan_id → null scope)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const fakeMessages = [{ role: "user", content: "hello" }];
    loadHistoryMock.mockResolvedValue(fakeMessages);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ messages: fakeMessages });
    expect(loadHistoryMock).toHaveBeenCalledWith("u1", null);
  });

  it("passes plan_id to loadHistory when provided", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    loadHistoryMock.mockResolvedValue([]);
    await GET(makeReq("plan-abc"));
    expect(loadHistoryMock).toHaveBeenCalledWith("u1", "plan-abc");
  });
});

describe("DELETE /api/coach/messages", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    clearMessagesMock.mockReset();
  });

  it("returns 401 if not authed", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 204 for authed user (no plan_id → null scope)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    clearMessagesMock.mockResolvedValue(undefined);
    const res = await DELETE(makeReq());
    expect(res.status).toBe(204);
    expect(clearMessagesMock).toHaveBeenCalledWith("u1", null);
  });
});
