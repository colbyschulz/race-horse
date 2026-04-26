import { describe, it, expect, vi, beforeEach } from "vitest";

const handleMock = vi.fn();
vi.mock("@/strava/webhook", () => ({
  handleWebhookEvent: (...a: unknown[]) => handleMock(...a),
}));
const afterMock = vi.fn((fn: () => unknown) => Promise.resolve(fn()));
vi.mock("next/server", async (orig) => {
  const real = await orig<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => afterMock(fn) };
});

import { GET, POST } from "../route";

describe("Strava webhook route", () => {
  beforeEach(() => {
    handleMock.mockReset();
    afterMock.mockClear();
    process.env.STRAVA_VERIFY_TOKEN = "secret";
  });

  it("GET echoes the challenge when verify_token matches", async () => {
    const url =
      "http://test/api/strava/webhook?hub.mode=subscribe&hub.challenge=xyz123&hub.verify_token=secret";
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ "hub.challenge": "xyz123" });
  });

  it("GET 403s when verify_token mismatches", async () => {
    const url =
      "http://test/api/strava/webhook?hub.mode=subscribe&hub.challenge=xyz&hub.verify_token=wrong";
    const res = await GET(new Request(url));
    expect(res.status).toBe(403);
  });

  it("POST returns 200 immediately and dispatches event via after()", async () => {
    const event = {
      aspect_type: "create",
      event_time: 0,
      object_id: 1,
      object_type: "activity",
      owner_id: 9,
      subscription_id: 7,
    };
    const res = await POST(
      new Request("http://test/api/strava/webhook", {
        method: "POST",
        body: JSON.stringify(event),
      }),
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(handleMock).toHaveBeenCalledWith(event);
  });

  it("POST returns 400 on bad JSON", async () => {
    const res = await POST(
      new Request("http://test/api/strava/webhook", {
        method: "POST",
        body: "{ not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
