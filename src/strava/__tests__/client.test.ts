import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchStrava } from "../client";

describe("fetchStrava", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("hits the Strava base URL with bearer token and parses JSON", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await fetchStrava<{ ok: boolean }>("/athlete", "tok123");
    expect(result).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://www.strava.com/api/v3/athlete",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok123",
        }),
      }),
    );
  });

  it("appends query params correctly", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("[]", { status: 200 }),
    );
    await fetchStrava("/athlete/activities", "tok", {
      params: { per_page: 100, after: 1234567890 },
    });
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain("per_page=100");
    expect(url).toContain("after=1234567890");
  });

  it("retries on 429 with exponential backoff and eventually succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response("rate", { status: 429 }))
      .mockResolvedValueOnce(new Response("rate", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const promise = fetchStrava<{ ok: boolean }>("/x", "tok", {
      maxRetries: 3,
      baseDelayMs: 10,
    });
    await vi.runAllTimersAsync();
    expect(await promise).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws StravaApiError on non-retryable status", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("nope", { status: 404 }),
    );
    await expect(fetchStrava("/missing", "tok")).rejects.toMatchObject({
      status: 404,
    });
  });
});
