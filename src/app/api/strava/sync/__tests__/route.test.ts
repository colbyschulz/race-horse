import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));

const updateMock = vi.fn();
vi.mock("@/db", () => ({
  db: { update: () => ({ set: () => ({ where: updateMock }) }) },
}));
vi.mock("@/db/schema", () => ({ users: { id: "id" } }));

const syncActivitiesMock = vi.fn();
vi.mock("@/strava/sync", () => ({
  syncActivities: (...a: unknown[]) => syncActivitiesMock(...a),
}));

const afterMock = vi.fn((fn: () => unknown) => Promise.resolve(fn()));
vi.mock("next/server", async (orig) => {
  const real = await orig<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => afterMock(fn) };
});

import { POST } from "../route";

describe("POST /api/strava/sync", () => {
  beforeEach(() => {
    authMock.mockReset();
    updateMock.mockReset().mockResolvedValue(undefined);
    syncActivitiesMock.mockReset().mockResolvedValue({
      upserted: 3,
      detailFailures: 0,
      pages: 1,
    });
    afterMock.mockClear();
  });

  it("returns 401 if unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(new Request("http://test"));
    expect(res.status).toBe(401);
  });

  it("schedules a 7-day sync via after() and returns 202", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(new Request("http://test"));
    expect(res.status).toBe(202);
    expect(afterMock).toHaveBeenCalledOnce();
    // wait for the deferred work
    await new Promise((r) => setImmediate(r));
    expect(syncActivitiesMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }));
    expect(updateMock).toHaveBeenCalled();
  });
});
