import { describe, it, expect } from "vitest";
import { groupActivitiesByDate } from "../group-activities";
import type { Activity } from "@/types/strava";

const activity = (id: string, start_date: string) => ({ id, start_date }) as Activity;

describe("groupActivitiesByDate", () => {
  it("files an evening run under the day it was run, not the UTC day", () => {
    const morning = activity("a", "2026-04-20T15:00:00.000Z"); // 8am in Los Angeles
    const evening = activity("b", "2026-04-21T01:30:00.000Z"); // 6:30pm the same day

    const byDate = groupActivitiesByDate([morning, evening], "America/Los_Angeles");

    expect([...byDate.keys()]).toEqual(["2026-04-20"]);
    expect(byDate.get("2026-04-20")).toEqual([morning, evening]);
  });

  it("groups by UTC day when no timezone is given", () => {
    const evening = activity("b", "2026-04-21T01:30:00.000Z");
    expect([...groupActivitiesByDate([evening]).keys()]).toEqual(["2026-04-21"]);
  });
});
