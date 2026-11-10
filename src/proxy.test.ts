// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(`https://app.test${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

const SECURE = "__Secure-authjs.session-token=tok";

describe("proxy", () => {
  it("lets a signed-out visitor see the sign-in page", () => {
    const response = proxy(request("/"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sends a signed-out visitor from an app route to the sign-in page", () => {
    const response = proxy(request("/plans/123"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/");
  });

  it("sends a visitor with a session cookie from / to /today", () => {
    const response = proxy(request("/", SECURE));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/today");
  });

  it("lets a visitor with a session cookie through to app routes", () => {
    const response = proxy(request("/today", SECURE));
    expect(response.headers.get("location")).toBeNull();
  });

  it("rolls the secure session cookie forward 30 days", () => {
    const setCookie = proxy(request("/today", SECURE)).headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Secure-authjs.session-token=tok");
    expect(setCookie).toContain("Max-Age=2592000");
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("rolls the plain cookie used on http without the Secure flag", () => {
    const setCookie =
      proxy(request("/today", "authjs.session-token=tok")).headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("authjs.session-token=tok");
    expect(setCookie).not.toMatch(/Secure/);
  });
});
