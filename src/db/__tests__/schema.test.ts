import { describe, it, expect } from "vitest";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  activities,
  activityLaps,
} from "../schema";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("schema", () => {
  it("defines NextAuth tables required by the Drizzle adapter", () => {
    expect(getTableConfig(users).name).toBe("user");
    expect(getTableConfig(accounts).name).toBe("account");
    expect(getTableConfig(sessions).name).toBe("session");
    expect(getTableConfig(verificationTokens).name).toBe("verificationToken");
  });

  it("user table has a preferences jsonb column", () => {
    const cols = getTableConfig(users).columns;
    const prefs = cols.find((c) => c.name === "preferences");
    expect(prefs).toBeDefined();
    expect(prefs?.dataType).toBe("json");
  });

  it("user.preferences default includes mi units and a timezone fallback", () => {
    const cols = getTableConfig(users).columns;
    const prefs = cols.find((c) => c.name === "preferences");
    expect(prefs?.hasDefault).toBe(true);
  });

  it("user table has a coach_notes text column with empty default", () => {
    const cols = getTableConfig(users).columns;
    const notes = cols.find((c) => c.name === "coach_notes");
    expect(notes).toBeDefined();
    expect(notes?.dataType).toBe("string");
    expect(notes?.notNull).toBe(true);
    expect(notes?.hasDefault).toBe(true);
  });
});

describe("activities schema", () => {
  it("activity table is named 'activity' and has expected columns", () => {
    const cfg = getTableConfig(activities);
    expect(cfg.name).toBe("activity");
    const names = cfg.columns.map((c) => c.name);
    for (const col of [
      "id",
      "userId",
      "strava_id",
      "start_date",
      "name",
      "type",
      "distance_meters",
      "moving_time_seconds",
      "elapsed_time_seconds",
      "avg_hr",
      "max_hr",
      "avg_pace_seconds_per_km",
      "avg_power_watts",
      "elevation_gain_m",
      "raw",
      "created_at",
      "updated_at",
    ]) {
      expect(names, `expected column ${col}`).toContain(col);
    }
  });

  it("strava_id is unique", () => {
    const cfg = getTableConfig(activities);
    const stravaId = cfg.columns.find((c) => c.name === "strava_id");
    expect(stravaId?.isUnique).toBe(true);
  });

  it("activity_lap table has activity_id fk and lap_index", () => {
    const cfg = getTableConfig(activityLaps);
    expect(cfg.name).toBe("activity_lap");
    const names = cfg.columns.map((c) => c.name);
    for (const col of [
      "id",
      "activity_id",
      "lap_index",
      "distance_meters",
      "moving_time_seconds",
      "elapsed_time_seconds",
      "avg_pace_seconds_per_km",
      "avg_power_watts",
      "avg_hr",
      "max_hr",
      "elevation_gain_m",
      "start_index",
      "end_index",
    ]) {
      expect(names, `expected column ${col}`).toContain(col);
    }
  });

  it("user table has last_synced_at nullable timestamp", () => {
    const cols = getTableConfig(users).columns;
    const last = cols.find((c) => c.name === "last_synced_at");
    expect(last).toBeDefined();
    expect(last?.notNull).toBe(false);
  });
});
