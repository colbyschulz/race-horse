import { describe, it, expect, vi, beforeEach } from "vitest";

const insertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};
const insertLapsChain = {
  values: vi.fn().mockResolvedValue(undefined),
};
const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };

const txMock = {
  insert: vi.fn(),
  delete: vi.fn(() => deleteChain),
};

vi.mock("@/db", () => ({
  db: {
    transaction: (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
    insert: () => insertChain,
    delete: () => deleteChain,
  },
}));
vi.mock("@/db/schema", () => ({
  activities: { id: "id", strava_id: "strava_id" },
  activityLaps: { activity_id: "activity_id" },
}));

import { upsertActivity, replaceLaps, deleteActivityByStravaId } from "../upsert";
import type { ActivityInsertRow, LapInsertRow } from "../normalize";

describe("upsertActivity", () => {
  beforeEach(() => {
    insertChain.values.mockClear().mockReturnThis();
    insertChain.onConflictDoUpdate.mockClear().mockReturnThis();
    insertChain.returning.mockReset();
  });

  it("inserts with ON CONFLICT (strava_id) DO UPDATE and returns id", async () => {
    insertChain.returning.mockResolvedValueOnce([{ id: "act-uuid" }]);
    const row: ActivityInsertRow = {
      userId: "u1",
      strava_id: 1,
      start_date: new Date(),
      name: "n",
      type: "Run",
      distance_meters: "1",
      moving_time_seconds: 1,
      elapsed_time_seconds: 1,
      avg_hr: null,
      max_hr: null,
      avg_pace_seconds_per_km: null,
      avg_power_watts: null,
      elevation_gain_m: null,
      raw: {},
    };
    const id = await upsertActivity(row);
    expect(id).toBe("act-uuid");
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
  });
});

describe("replaceLaps", () => {
  beforeEach(() => {
    txMock.insert.mockReset();
    txMock.delete.mockClear();
    deleteChain.where.mockClear();
    insertLapsChain.values.mockClear().mockResolvedValue(undefined);
  });

  it("deletes existing laps and inserts new ones in a transaction", async () => {
    txMock.insert.mockReturnValue(insertLapsChain);
    const laps: LapInsertRow[] = [
      {
        activity_id: "act-1",
        lap_index: 1,
        distance_meters: "1000",
        moving_time_seconds: 300,
        elapsed_time_seconds: 305,
        avg_pace_seconds_per_km: null,
        avg_power_watts: null,
        avg_hr: null,
        max_hr: null,
        elevation_gain_m: null,
        start_index: null,
        end_index: null,
      },
    ];
    await replaceLaps("act-1", laps);
    expect(txMock.delete).toHaveBeenCalledOnce();
    expect(deleteChain.where).toHaveBeenCalledOnce();
    expect(insertLapsChain.values).toHaveBeenCalledWith(laps);
  });

  it("is a no-op insert when laps array is empty (still deletes)", async () => {
    await replaceLaps("act-1", []);
    expect(txMock.delete).toHaveBeenCalled();
    expect(txMock.insert).not.toHaveBeenCalled();
  });
});

describe("deleteActivityByStravaId", () => {
  it("calls db.delete with the strava_id condition", async () => {
    deleteChain.where.mockResolvedValueOnce(undefined);
    await deleteActivityByStravaId(12345);
    expect(deleteChain.where).toHaveBeenCalled();
  });
});
