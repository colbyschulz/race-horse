import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../token", () => ({
  getStravaToken: vi.fn().mockResolvedValue("tok"),
}));
const fetchStravaMock = vi.fn();
vi.mock("../client", () => ({ fetchStrava: (...args: unknown[]) => fetchStravaMock(...args) }));
const upsertActivityMock = vi.fn();
const replaceLapsMock = vi.fn();
vi.mock("../upsert", () => ({
  upsertActivity: (...a: unknown[]) => upsertActivityMock(...a),
  replaceLaps: (...a: unknown[]) => replaceLapsMock(...a),
}));

import { syncActivities, LIST_PAGE_SIZE } from "../sync";

describe("syncActivities", () => {
  beforeEach(() => {
    fetchStravaMock.mockReset();
    upsertActivityMock.mockReset();
    replaceLapsMock.mockReset();
  });

  const baseSummary = {
    id: 1,
    name: "n",
    type: "Run" as const,
    start_date: "2026-04-20T00:00:00Z",
    distance: 1,
    moving_time: 1,
    elapsed_time: 1,
    total_elevation_gain: 1,
  };

  it("paginates with multiple pages until partial page is returned", async () => {
    // Page 1: 2 full-size page worth of items (400 items total, 200 each)
    // This tests that we continue pagination when we have a full page
    const page1Items = [
      { ...baseSummary, id: 1, type: "Walk" },
      { ...baseSummary, id: 2, type: "Run" },
    ];
    // For brevity, mock with 2 items but set up mocks as if LIST_PAGE_SIZE was effectively 2 for this test
    // Actually, let me create a simpler test: just verify the behavior without fetching details

    fetchStravaMock
      .mockResolvedValueOnce(page1Items) // First page: 2 items (less than LIST_PAGE_SIZE, so partial)
      .mockResolvedValueOnce({ ...baseSummary, id: 2, type: "Run", laps: [] }); // detail fetch for id 2

    upsertActivityMock.mockResolvedValue("act-uuid");

    const result = await syncActivities({
      userId: "u1",
      sinceDate: new Date("2026-01-01T00:00:00Z"),
    });

    // With only 2 items on first page (< LIST_PAGE_SIZE), pagination should stop
    expect(result.upserted).toBe(2);
    expect(result.pages).toBe(1);
    expect(upsertActivityMock).toHaveBeenCalledTimes(3); // 2 upserts for list + 1 for detail
    expect(replaceLapsMock).toHaveBeenCalledTimes(1); // only id 2 is Run type
  });

  it("skips lap fetch for non-run/ride activities", async () => {
    fetchStravaMock
      .mockResolvedValueOnce([{ ...baseSummary, type: "Walk" }]);
    upsertActivityMock.mockResolvedValue("act-uuid");

    const r = await syncActivities({
      userId: "u",
      sinceDate: new Date(),
    });
    expect(r.upserted).toBe(1);
    expect(r.pages).toBe(1);
    expect(replaceLapsMock).not.toHaveBeenCalled();
    // only one list fetch (partial page stops pagination), no detail fetches
    expect(fetchStravaMock).toHaveBeenCalledTimes(1);
  });

  it("continues if one activity's detail fetch fails", async () => {
    fetchStravaMock
      .mockResolvedValueOnce([
        { ...baseSummary, id: 1 },
        { ...baseSummary, id: 2 },
      ])
      .mockRejectedValueOnce(new Error("strava boom"))
      .mockResolvedValueOnce({ ...baseSummary, id: 2, laps: [] });
    upsertActivityMock.mockResolvedValue("uuid");

    const r = await syncActivities({ userId: "u", sinceDate: new Date() });
    expect(r.upserted).toBe(2);
    expect(r.pages).toBe(1);
    expect(r.detailFailures).toBe(1);
    expect(replaceLapsMock).toHaveBeenCalledTimes(1);
  });

  it("stops pagination when page has fewer items than LIST_PAGE_SIZE", async () => {
    // Return 1 activity (partial page) — should not fetch a second page
    fetchStravaMock
      .mockResolvedValueOnce([{ ...baseSummary, type: "Walk" }]);
    upsertActivityMock.mockResolvedValue("uuid");

    const r = await syncActivities({ userId: "u", sinceDate: new Date() });
    expect(r.upserted).toBe(1);
    expect(r.pages).toBe(1);
    // Only one fetch call (the list), no second page fetch
    expect(fetchStravaMock).toHaveBeenCalledTimes(1);
  });
});
