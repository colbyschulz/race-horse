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

  it("paginates until an empty page is returned", async () => {
    fetchStravaMock
      .mockResolvedValueOnce([{ ...baseSummary, id: 1 }, { ...baseSummary, id: 2 }])
      .mockResolvedValueOnce({ ...baseSummary, id: 1, laps: [] }) // detail for id 1
      .mockResolvedValueOnce({ ...baseSummary, id: 2, laps: [] }) // detail for id 2
      .mockResolvedValueOnce([]); // second list page empty

    upsertActivityMock.mockResolvedValue("act-uuid");

    const result = await syncActivities({
      userId: "u1",
      sinceDate: new Date("2026-01-01T00:00:00Z"),
    });

    expect(result.upserted).toBe(2);
    expect(result.pages).toBe(2);
    expect(upsertActivityMock).toHaveBeenCalledTimes(4);
    expect(replaceLapsMock).toHaveBeenCalledTimes(2);
    // first call should be a list call to /athlete/activities
    expect(fetchStravaMock.mock.calls[0][0]).toBe("/athlete/activities");
    expect(fetchStravaMock.mock.calls[0][2]).toMatchObject({
      params: expect.objectContaining({ per_page: LIST_PAGE_SIZE, page: 1 }),
    });
  });

  it("skips lap fetch for non-run/ride activities", async () => {
    fetchStravaMock
      .mockResolvedValueOnce([{ ...baseSummary, type: "Walk" }])
      .mockResolvedValueOnce([]);
    upsertActivityMock.mockResolvedValue("act-uuid");

    const r = await syncActivities({
      userId: "u",
      sinceDate: new Date(),
    });
    expect(r.upserted).toBe(1);
    expect(replaceLapsMock).not.toHaveBeenCalled();
    // exactly two list fetches, no detail fetches
    expect(fetchStravaMock).toHaveBeenCalledTimes(2);
  });

  it("continues if one activity's detail fetch fails", async () => {
    fetchStravaMock
      .mockResolvedValueOnce([
        { ...baseSummary, id: 1 },
        { ...baseSummary, id: 2 },
      ])
      .mockRejectedValueOnce(new Error("strava boom"))
      .mockResolvedValueOnce({ ...baseSummary, id: 2, laps: [] })
      .mockResolvedValueOnce([]);
    upsertActivityMock.mockResolvedValue("uuid");

    const r = await syncActivities({ userId: "u", sinceDate: new Date() });
    expect(r.upserted).toBe(2);
    expect(r.detailFailures).toBe(1);
    expect(replaceLapsMock).toHaveBeenCalledTimes(1);
  });
});
