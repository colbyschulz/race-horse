// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { missingEnv, reportMissingEnv } from "../env";

const complete = {
  DATABASE_URL: "x",
  AUTH_SECRET: "x",
  AUTH_STRAVA_ID: "x",
  AUTH_STRAVA_SECRET: "x",
  ANTHROPIC_API_KEY: "x",
  BLOB_READ_WRITE_TOKEN: "x",
  STRAVA_VERIFY_TOKEN: "x",
  ADMIN_API_TOKEN: "x",
};

describe("environment check", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finds nothing missing when every required variable is set", () => {
    expect(missingEnv(complete)).toEqual([]);
  });

  it("names each missing required variable and what it breaks", () => {
    const missing = missingEnv({ ...complete, ANTHROPIC_API_KEY: undefined, AUTH_SECRET: "" });
    expect(missing.map((m) => m.name)).toEqual(["AUTH_SECRET", "ANTHROPIC_API_KEY"]);
    expect(missing[1].breaks).toContain("coach");
  });

  it("logs an error for a missing required variable without throwing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => reportMissingEnv({ ...complete, DATABASE_URL: undefined })).not.toThrow();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain("DATABASE_URL");
    expect(warn).not.toHaveBeenCalled();
  });

  it("only warns about an optional variable", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    reportMissingEnv({ ...complete, ADMIN_API_TOKEN: undefined });

    expect(error).not.toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain("ADMIN_API_TOKEN");
  });
});
