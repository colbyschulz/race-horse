// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => mockAuth() }));

const mockRows = vi.fn();
const mockSet = vi.fn();
vi.mock("@/server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => mockRows() }) }) }),
    update: () => ({
      set: (values: unknown) => {
        mockSet(values);
        return { where: () => Promise.resolve() };
      },
    }),
  },
}));

const mockSync = vi.fn();
vi.mock("@/server/strava/sync", () => ({ syncActivities: (opts: unknown) => mockSync(opts) }));

// Run the deferred work straight away so the test can see it.
const afterCallbacks: (() => Promise<void>)[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => afterCallbacks.push(fn),
}));

import { GET } from "../route";

describe("GET /api/me", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockRows.mockReset();
    mockSet.mockReset();
    mockSync.mockReset();
    afterCallbacks.length = 0;
  });

  it("returns 401 when signed out", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the name and that syncing is done for an existing user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockRows.mockResolvedValue([{ name: "Sam", last_synced_at: new Date() }]);

    const res = await GET();

    expect(await res.json()).toEqual({ name: "Sam", synced: true });
    expect(mockSet).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("starts the first Strava backfill for a user who has never synced", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockRows.mockResolvedValue([{ name: "Sam", last_synced_at: null }]);
    mockSync.mockResolvedValue({});

    const res = await GET();

    // Reported as not yet synced, with a marker written so a second request
    // doesn't start another backfill.
    expect(await res.json()).toEqual({ name: "Sam", synced: false });
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(afterCallbacks).toHaveLength(1);

    await afterCallbacks[0]();
    expect(mockSync).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }));
    const { sinceDate } = mockSync.mock.calls[0][0] as { sinceDate: Date };
    const days = (Date.now() - sinceDate.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });
});
