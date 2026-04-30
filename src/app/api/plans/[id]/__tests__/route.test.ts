import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.fn();
const getPlanById = vi.fn();
const setActivePlan = vi.fn();
const archivePlan = vi.fn();
const deletePlan = vi.fn();

vi.mock("@/server/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/server/plans/queries", () => ({
  getPlanById: (...a: unknown[]) => getPlanById(...a),
  setActivePlan: (...a: unknown[]) => setActivePlan(...a),
  archivePlan: (...a: unknown[]) => archivePlan(...a),
  deletePlan: (...a: unknown[]) => deletePlan(...a),
}));

import { GET, PATCH, DELETE } from "../route";

function makeReq(method: string, body?: unknown): Request {
  return new Request("http://x/api/plans/p1", {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : {},
  });
}
const ctx = { params: Promise.resolve({ id: "p1" }) };

describe("GET /api/plans/[id]", () => {
  beforeEach(() => {
    auth.mockReset();
    getPlanById.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    auth.mockResolvedValueOnce(null);
    const res = await GET(makeReq("GET"), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when plan not found / not owned", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce(null);
    const res = await GET(makeReq("GET"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns the plan when found", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce({ id: "p1", title: "Boston" });
    const res = await GET(makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: { id: "p1", title: "Boston" } });
  });
});

describe("PATCH /api/plans/[id]", () => {
  beforeEach(() => {
    auth.mockReset();
    getPlanById.mockReset();
    setActivePlan.mockReset();
    archivePlan.mockReset();
  });

  it("calls setActivePlan when is_active=true", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce({ id: "p1" });
    const res = await PATCH(makeReq("PATCH", { is_active: true }), ctx);
    expect(res.status).toBe(200);
    expect(setActivePlan).toHaveBeenCalledWith("p1", "u1");
  });

  it("calls archivePlan when is_active=false", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce({ id: "p1" });
    const res = await PATCH(makeReq("PATCH", { is_active: false }), ctx);
    expect(res.status).toBe(200);
    expect(archivePlan).toHaveBeenCalledWith("p1", "u1");
  });

  it("returns 404 when plan not owned", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq("PATCH", { is_active: true }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when body lacks is_active", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce({ id: "p1" });
    const res = await PATCH(makeReq("PATCH", {}), ctx);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/plans/[id]", () => {
  beforeEach(() => {
    auth.mockReset();
    getPlanById.mockReset();
    deletePlan.mockReset();
  });

  it("returns 404 when plan not owned", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce(null);
    const res = await DELETE(makeReq("DELETE"), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes and returns 204", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce({ id: "p1" });
    const res = await DELETE(makeReq("DELETE"), ctx);
    expect(res.status).toBe(204);
    expect(deletePlan).toHaveBeenCalledWith("p1", "u1");
  });
});
