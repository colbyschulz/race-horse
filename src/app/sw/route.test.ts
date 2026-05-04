import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "./route";

describe("GET /sw", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 200 with application/javascript content type", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/javascript");
  });

  it("embeds VERCEL_GIT_COMMIT_SHA in the cache name", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123def");
    const response = await GET();
    const text = await response.text();
    expect(text).toContain("rh-nav-abc123def");
  });

  it("falls back to 'dev' when VERCEL_GIT_COMMIT_SHA is absent", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    const response = await GET();
    const text = await response.text();
    expect(text).toContain("rh-nav-dev");
  });

  it("sets Cache-Control no-cache header", async () => {
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toContain("no-cache");
  });

  it("sets Service-Worker-Allowed header to /", async () => {
    const response = await GET();
    expect(response.headers.get("Service-Worker-Allowed")).toBe("/");
  });
});
