import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.fn();
const listPlansWithCounts = vi.fn();
const createPlan = vi.fn();

vi.mock("@/server/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/server/plans/queries", () => ({
  listPlansWithCounts: (...a: unknown[]) => listPlansWithCounts(...a),
  createPlan: (...a: unknown[]) => createPlan(...a),
}));

import { GET, POST } from "../route";

function makeReq(body?: unknown): Request {
  return new Request("http://x/api/plans", {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : {},
  });
}

describe("GET /api/plans", () => {
  beforeEach(() => {
    auth.mockReset();
    listPlansWithCounts.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    auth.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns plans for the user", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    listPlansWithCounts.mockResolvedValueOnce([{ id: "p1", title: "Boston" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans).toEqual([{ id: "p1", title: "Boston" }]);
    expect(listPlansWithCounts).toHaveBeenCalledWith("u1");
  });
});

describe("POST /api/plans", () => {
  beforeEach(() => {
    auth.mockReset();
    createPlan.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    auth.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({
        title: "x",
        sport: "run",
        mode: "indefinite",
        start_date: "2026-01-01",
        source: "coach_generated",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing required fields", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    const res = await POST(makeReq({ title: "x" }));
    expect(res.status).toBe(400);
  });

  it("creates the plan and returns 201", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    createPlan.mockResolvedValueOnce({ id: "p-new", title: "Boston" });
    const res = await POST(
      makeReq({
        title: "Boston",
        sport: "run",
        mode: "goal",
        start_date: "2026-01-01",
        end_date: "2026-05-05",
        goal: { target_time: "3:05", race_date: "2026-05-05" },
        source: "coach_generated",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.plan).toEqual({ id: "p-new", title: "Boston" });
    expect(createPlan).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        title: "Boston",
        sport: "run",
        mode: "goal",
      })
    );
  });
});
