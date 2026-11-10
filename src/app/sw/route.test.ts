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

// --- Behaviour of the generated worker, run against in-memory fakes ---------

const ORIGIN = "https://app.test";

interface FakeResponse {
  body: string;
  ok: boolean;
  status: number;
  redirected: boolean;
  clone(): FakeResponse;
}

function fakeResponse(body: string, init: Partial<FakeResponse> = {}): FakeResponse {
  const response: FakeResponse = {
    body,
    ok: true,
    status: 200,
    redirected: false,
    clone: () => fakeResponse(body, init),
    ...init,
  };
  return response;
}

function keyOf(target: string | { url: string }) {
  const url = typeof target === "string" ? target : target.url;
  return new URL(url, ORIGIN).pathname;
}

class FakeCache {
  entries = new Map<string, FakeResponse>();
  async match(target: string | { url: string }) {
    return this.entries.get(keyOf(target));
  }
  async put(target: string | { url: string }, response: FakeResponse) {
    this.entries.set(keyOf(target), response);
  }
  async delete(target: string | { url: string }) {
    return this.entries.delete(keyOf(target));
  }
  async keys() {
    return [...this.entries.keys()].map((path) => ({ url: ORIGIN + path }));
  }
}

class FakeEvent {
  response: Promise<FakeResponse | Response> | undefined;
  pending: Promise<unknown>[] = [];
  constructor(public request: { url: string; method: string; mode: string }) {}
  respondWith(response: Promise<FakeResponse | Response>) {
    this.response = Promise.resolve(response);
  }
  waitUntil(promise: Promise<unknown>) {
    this.pending.push(promise);
  }
  async settled() {
    await this.response;
    while (this.pending.length) await this.pending.shift();
  }
}

async function loadWorker(version: string) {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", version);
  const source = await (await GET()).text();

  const listeners: Record<string, (event: FakeEvent) => void> = {};
  const stores = new Map<string, FakeCache>();
  const posted: unknown[] = [];
  const fetchMock = vi.fn<(target: string | { url: string }) => Promise<FakeResponse>>();

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: FakeEvent) => void) => (listeners[type] = fn),
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(),
      matchAll: async () => [{ postMessage: (message: unknown) => posted.push(message) }],
    },
  };
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name)!;
    },
    delete: async (name: string) => stores.delete(name),
    keys: async () => [...stores.keys()],
  };

  new Function("self", "caches", "fetch", source)(self, caches, fetchMock);

  const navCache = () => caches.open(`rh-nav-${version || "dev"}`);
  const dispatch = (path: string, mode = "navigate") => {
    const event = new FakeEvent({ url: ORIGIN + path, method: "GET", mode });
    listeners.fetch(event);
    return event;
  };
  return { fetchMock, posted, stores, navCache, dispatch, listeners };
}

describe("service worker behaviour", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("paints /today from the cache without waiting on the network, then refreshes it", async () => {
    const worker = await loadWorker("v1");
    await (await worker.navCache()).put("/today", fakeResponse("stale"));
    let release!: (response: FakeResponse) => void;
    worker.fetchMock.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const event = worker.dispatch("/today");
    expect(((await event.response) as FakeResponse).body).toBe("stale");

    release(fakeResponse("fresh"));
    await event.settled();
    expect((await (await worker.navCache()).match("/today"))?.body).toBe("fresh");
    expect(worker.posted).toEqual([]);
  });

  it("drops cached pages and tells the page when the refresh lands on the sign-in page", async () => {
    const worker = await loadWorker("v1");
    await (await worker.navCache()).put("/today", fakeResponse("stale"));
    worker.fetchMock.mockResolvedValue(fakeResponse("sign in", { redirected: true }));

    const event = worker.dispatch("/today");
    await event.settled();

    expect(worker.stores.has("rh-nav-v1")).toBe(false);
    expect(worker.posted).toEqual([{ type: "rh-signed-out" }]);
  });

  it("keeps the cached shell when the refresh fails", async () => {
    const worker = await loadWorker("v1");
    await (await worker.navCache()).put("/today", fakeResponse("stale"));
    worker.fetchMock.mockRejectedValue(new Error("offline"));

    const event = worker.dispatch("/today");
    await event.settled();

    expect((await (await worker.navCache()).match("/today"))?.body).toBe("stale");
    expect(worker.posted).toEqual([]);
  });

  it("goes to the network for /today when nothing is cached, and keeps the result", async () => {
    const worker = await loadWorker("v1");
    worker.fetchMock.mockResolvedValue(fakeResponse("fresh"));

    const event = worker.dispatch("/today");
    expect(((await event.response) as FakeResponse).body).toBe("fresh");
    await event.settled();

    expect((await (await worker.navCache()).match("/today"))?.body).toBe("fresh");
  });

  it("redirects / to the cached shell without touching the network", async () => {
    const worker = await loadWorker("v1");
    await (await worker.navCache()).put("/today", fakeResponse("stale"));

    const response = (await worker.dispatch("/").response) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`${ORIGIN}/today`);
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  it("sends / to the network when no shell is cached", async () => {
    const worker = await loadWorker("v1");
    worker.fetchMock.mockResolvedValue(fakeResponse("sign in"));

    const event = worker.dispatch("/");

    expect(((await event.response) as FakeResponse).body).toBe("sign in");
  });

  it("serves build assets cache-first after the first fetch", async () => {
    const worker = await loadWorker("v1");
    worker.fetchMock.mockResolvedValue(fakeResponse("chunk"));

    await worker.dispatch("/_next/static/chunks/a.js", "no-cors").settled();
    const second = worker.dispatch("/_next/static/chunks/a.js", "no-cors");

    expect(((await second.response) as FakeResponse).body).toBe("chunk");
    expect(worker.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears cached pages when the sign-in page asks", async () => {
    const worker = await loadWorker("v1");
    await (await worker.navCache()).put("/today", fakeResponse("stale"));

    const pending: Promise<unknown>[] = [];
    (worker.listeners.message as unknown as (event: unknown) => void)({
      data: { type: "rh-clear-shell" },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    await Promise.all(pending);

    expect(worker.stores.has("rh-nav-v1")).toBe(false);
  });

  it("stays network-first in local dev, even with a cached /today", async () => {
    const worker = await loadWorker("");
    await (await worker.navCache()).put("/today", fakeResponse("stale"));
    worker.fetchMock.mockResolvedValue(fakeResponse("fresh"));

    const event = worker.dispatch("/today");
    expect(((await event.response) as FakeResponse).body).toBe("fresh");

    worker.dispatch("/_next/static/chunks/a.js", "no-cors");
    expect(worker.fetchMock).toHaveBeenCalledTimes(1);
  });
});
