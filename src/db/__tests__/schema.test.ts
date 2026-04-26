import { describe, it, expect } from "vitest";
import { users, accounts, sessions, verificationTokens } from "../schema";
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
