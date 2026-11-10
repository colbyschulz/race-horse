// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRows = vi.fn();
vi.mock("@/server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => mockRows() }) }) }),
  },
}));

import { GET } from "./route";

function request(cookie?: string) {
  return new NextRequest("https://app.test/session-expired", {
    headers: cookie ? { cookie } : undefined,
  });
}

const COOKIE = "__Secure-authjs.session-token=tok";

describe("GET /session-expired", () => {
  beforeEach(() => {
    mockRows.mockReset();
  });

  it("clears the cookie and goes to sign-in when the session is gone", async () => {
    mockRows.mockResolvedValue([]);
    const response = await GET(request(COOKIE));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/");
    expect(response.headers.get("set-cookie")).toContain("__Secure-authjs.session-token=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("clears the cookie when the session has expired", async () => {
    mockRows.mockResolvedValue([{ expires: new Date(Date.now() - 1000) }]);
    const response = await GET(request(COOKIE));
    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("keeps the cookie and offers a retry when the session is still live", async () => {
    mockRows.mockResolvedValue([{ expires: new Date(Date.now() + 60_000) }]);
    const response = await GET(request(COOKIE));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps the cookie and offers a retry when the database is unreachable", async () => {
    mockRows.mockRejectedValue(new Error("db down"));
    const response = await GET(request(COOKIE));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("goes to sign-in without a database lookup when there is no cookie", async () => {
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("https://app.test/");
    expect(mockRows).not.toHaveBeenCalled();
  });
});
