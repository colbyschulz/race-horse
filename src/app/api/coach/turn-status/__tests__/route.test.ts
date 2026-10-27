import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => mockAuth() }));

const mockGetTurnStatus = vi.fn();
vi.mock("@/server/coach/turn-status", () => ({
  getTurnStatus: (...args: unknown[]) => mockGetTurnStatus(...args),
}));

import { GET } from "../route";
import { NextRequest } from "next/server";

function makeReq(planId?: string) {
  const url = planId
    ? `http://localhost/api/coach/turn-status?plan_id=${planId}`
    : "http://localhost/api/coach/turn-status";
  return new NextRequest(url);
}

describe("GET /api/coach/turn-status", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetTurnStatus.mockReset();
  });

  it("returns 401 if not authed", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns { turn: null } when no turn exists (no plan_id → null scope)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetTurnStatus.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ turn: null });
    expect(mockGetTurnStatus).toHaveBeenCalledWith("u1", null);
  });

  it("passes plan_id through and returns the turn row", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetTurnStatus.mockResolvedValue({
      status: "running",
      error_message: null,
      started_at: new Date("2026-01-01"),
    });
    const res = await GET(makeReq("plan-abc"));
    expect(mockGetTurnStatus).toHaveBeenCalledWith("u1", "plan-abc");
    const body = await res.json();
    expect(body.turn.status).toBe("running");
  });
});
