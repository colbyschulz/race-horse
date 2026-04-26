import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.stubGlobal("fetch", vi.fn());

import { GET, POST, DELETE } from "../route";

describe("/api/strava/subscribe", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = "admin-secret";
    process.env.AUTH_STRAVA_ID = "sid";
    process.env.AUTH_STRAVA_SECRET = "ssecret";
    process.env.STRAVA_VERIFY_TOKEN = "vtoken";
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    delete process.env.ADMIN_API_TOKEN;
    delete process.env.AUTH_STRAVA_ID;
    delete process.env.AUTH_STRAVA_SECRET;
    delete process.env.STRAVA_VERIFY_TOKEN;
  });

  it("GET 401 when missing Authorization header", async () => {
    const res = await GET(new Request("http://test/api/strava/subscribe"));
    expect(res.status).toBe(401);
  });

  it("GET 401 when ADMIN_API_TOKEN not set", async () => {
    delete process.env.ADMIN_API_TOKEN;
    const res = await GET(
      new Request("http://test/api/strava/subscribe", {
        headers: { Authorization: "Bearer whatever" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("GET forwards to Strava and returns result when authed", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const res = await GET(
      new Request("http://test/api/strava/subscribe", {
        headers: { Authorization: "Bearer admin-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    const fetchedUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as URL;
    expect(fetchedUrl.toString()).toContain("push_subscriptions");
    expect(fetchedUrl.searchParams.get("client_id")).toBe("sid");
  });

  it("POST 400 when callback_url missing", async () => {
    const res = await POST(
      new Request("http://test/api/strava/subscribe", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("DELETE 400 when id missing", async () => {
    const res = await DELETE(
      new Request("http://test/api/strava/subscribe", {
        method: "DELETE",
        headers: {
          Authorization: "Bearer admin-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });
});
