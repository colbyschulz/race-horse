import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchStravaMock = vi.fn();
const upsertActivityMock = vi.fn();
const replaceLapsMock = vi.fn();
const deleteActivityByStravaIdMock = vi.fn();
const getStravaTokenMock = vi.fn().mockResolvedValue("tok");
const updateMock = vi.fn();
const selectMock = vi.fn();

vi.mock("../client", () => ({ fetchStrava: (...a: unknown[]) => fetchStravaMock(...a) }));
vi.mock("../token", () => ({ getStravaToken: (...a: unknown[]) => getStravaTokenMock(...a) }));
vi.mock("../upsert", () => ({
  upsertActivity: (...a: unknown[]) => upsertActivityMock(...a),
  replaceLaps: (...a: unknown[]) => replaceLapsMock(...a),
  deleteActivityByStravaId: (...a: unknown[]) => deleteActivityByStravaIdMock(...a),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: selectMock }) }) }),
    update: () => ({ set: () => ({ where: updateMock }) }),
  },
}));
vi.mock("@/db/schema", () => ({
  accounts: { providerAccountId: "providerAccountId", provider: "provider" },
}));

import { handleWebhookEvent } from "../webhook";

describe("handleWebhookEvent", () => {
  beforeEach(() => {
    fetchStravaMock.mockReset();
    upsertActivityMock.mockReset().mockResolvedValue("uuid");
    replaceLapsMock.mockReset();
    deleteActivityByStravaIdMock.mockReset();
    getStravaTokenMock.mockReset().mockResolvedValue("tok");
    updateMock.mockReset();
    selectMock.mockReset();
  });

  const baseEvent = {
    aspect_type: "create" as const,
    event_time: 0,
    object_id: 100,
    object_type: "activity" as const,
    owner_id: 555,
    subscription_id: 1,
  };

  it("create → fetches detail and upserts activity + laps", async () => {
    selectMock.mockResolvedValueOnce([{ userId: "u-1" }]);
    fetchStravaMock.mockResolvedValueOnce({
      id: 100,
      name: "n",
      type: "Run",
      start_date: "2026-04-25T00:00:00Z",
      distance: 1,
      moving_time: 1,
      elapsed_time: 1,
      total_elevation_gain: 1,
      laps: [],
    });
    await handleWebhookEvent(baseEvent);
    expect(fetchStravaMock).toHaveBeenCalledWith(
      "/activities/100",
      "tok",
      expect.objectContaining({ params: { include_all_efforts: "true" } }),
    );
    expect(upsertActivityMock).toHaveBeenCalledOnce();
    expect(replaceLapsMock).toHaveBeenCalledOnce();
  });

  it("delete activity → calls deleteActivityByStravaId", async () => {
    selectMock.mockResolvedValueOnce([{ userId: "u-1" }]);
    await handleWebhookEvent({ ...baseEvent, aspect_type: "delete" });
    expect(deleteActivityByStravaIdMock).toHaveBeenCalledWith(100);
    expect(fetchStravaMock).not.toHaveBeenCalled();
  });

  it("athlete deauth clears tokens", async () => {
    selectMock.mockResolvedValueOnce([{ userId: "u-1" }]);
    updateMock.mockResolvedValue(undefined);
    await handleWebhookEvent({
      ...baseEvent,
      object_type: "athlete",
      aspect_type: "update",
      updates: { authorized: "false" },
    });
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("ignores events for unknown athlete owner_id", async () => {
    selectMock.mockResolvedValueOnce([]);
    await handleWebhookEvent(baseEvent);
    expect(fetchStravaMock).not.toHaveBeenCalled();
    expect(upsertActivityMock).not.toHaveBeenCalled();
  });
});
