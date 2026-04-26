import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const updateMock = vi.fn();
vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => updateMock(),
      }),
    }),
  },
}));

import { POST } from "../route";

describe("POST /api/preferences", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    updateMock.mockReset();
  });

  it("returns 401 if not authed", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request("http://test/api/preferences", {
      method: "POST",
      body: JSON.stringify({
        units: "mi",
        timezone: "America/Los_Angeles",
        pace_format: "min_per_mi",
        power_units: "watts",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid payload", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const req = new Request("http://test/api/preferences", {
      method: "POST",
      body: JSON.stringify({ units: "lightyears" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("updates preferences for the authed user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    updateMock.mockResolvedValue(undefined);
    const req = new Request("http://test/api/preferences", {
      method: "POST",
      body: JSON.stringify({
        units: "km",
        timezone: "Europe/London",
        pace_format: "min_per_km",
        power_units: "watts",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
  });
});
