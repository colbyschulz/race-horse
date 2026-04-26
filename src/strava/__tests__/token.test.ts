import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const selectMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: selectMock }) }) }),
    update: () => ({ set: () => ({ where: updateMock }) }),
  },
}));

vi.mock("@/db/schema", () => ({ accounts: { provider: "provider" } }));

import { getStravaToken } from "../token";

describe("getStravaToken", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    process.env.AUTH_STRAVA_ID = "id";
    process.env.AUTH_STRAVA_SECRET = "secret";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = realFetch;
  });

  it("returns the existing access token when not near expiry", async () => {
    selectMock.mockResolvedValueOnce([
      {
        access_token: "good",
        refresh_token: "r",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    ]);
    const tok = await getStravaToken("user-1");
    expect(tok).toBe("good");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refreshes when within 60s of expiry and persists new tokens", async () => {
    selectMock.mockResolvedValueOnce([
      {
        access_token: "old",
        refresh_token: "old-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 30,
      },
    ]);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token_type: "Bearer",
          access_token: "new",
          refresh_token: "new-refresh",
          expires_at: Math.floor(Date.now() / 1000) + 21600,
          expires_in: 21600,
        }),
        { status: 200 },
      ),
    );
    updateMock.mockResolvedValueOnce(undefined);

    const tok = await getStravaToken("user-1");
    expect(tok).toBe("new");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://www.strava.com/api/v3/oauth/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("throws when no Strava account row exists", async () => {
    selectMock.mockResolvedValueOnce([]);
    await expect(getStravaToken("user-x")).rejects.toThrow(/no strava account/i);
  });
});
