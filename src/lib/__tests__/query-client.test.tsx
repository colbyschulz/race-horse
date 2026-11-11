import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Component, useEffect, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  dehydrate,
  useIsRestoring,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { QueryProvider } from "../query-client";
import { CSRSuspense } from "../csr-suspense";
import { fetchJson } from "../api-client";
import { QUERY_CACHE_STORAGE_KEY } from "../query-cache-key";

function saveCache(buster: string, entries: [unknown[], unknown][]) {
  const seed = new QueryClient();
  for (const [key, data] of entries) {
    // Old enough to count as stale, so showing it also triggers a refetch.
    seed.setQueryData(key, data, { updatedAt: Date.now() - 60_000 });
  }
  localStorage.setItem(
    QUERY_CACHE_STORAGE_KEY,
    JSON.stringify({ buster, timestamp: Date.now(), clientState: dehydrate(seed) })
  );
}

function Greeting() {
  const { data } = useSuspenseQuery({
    queryKey: ["greeting"],
    queryFn: () => fetchJson<{ text: string }>("/api/greeting"),
  });
  return <p>{data.text}</p>;
}

function renderGreeting() {
  return render(
    <QueryProvider>
      <CSRSuspense fallback={<p>loading</p>}>
        <Greeting />
      </CSRSuspense>
    </QueryProvider>
  );
}

const never = () => new Promise<Response>(() => {});

describe("QueryProvider with a saved cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows saved data without waiting on the network, and refetches behind it", async () => {
    saveCache("1", [[["greeting"], { text: "from storage" }]]);
    const fetchMock = vi.fn(never);
    vi.stubGlobal("fetch", fetchMock);

    renderGreeting();

    expect(await screen.findByText("from storage")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("replaces saved data once the refetch lands", async () => {
    saveCache("1", [[["greeting"], { text: "from storage" }]]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ text: "from network" }))
    );

    renderGreeting();

    expect(await screen.findByText("from network")).toBeInTheDocument();
  });

  it("ignores a cache saved under an older cache version", async () => {
    saveCache("0", [[["greeting"], { text: "from storage" }]]);
    vi.stubGlobal("fetch", vi.fn(never));

    renderGreeting();

    await waitFor(() => expect(localStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull());
    expect(screen.queryByText("from storage")).not.toBeInTheDocument();
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("does not save coach conversations to the device", async () => {
    function Seed() {
      const client = useQueryClient();
      const isRestoring = useIsRestoring();
      // Saving starts once the stored cache has been read back, and the
      // provider subscribes in an effect that runs after this child's.
      useEffect(() => {
        if (isRestoring) return;
        const handle = setTimeout(() => {
          client.setQueryData(["coach", "messages", "p1"], [{ id: "m1" }]);
          client.setQueryData(["coach", "notes"], "likes hills");
        }, 0);
        return () => clearTimeout(handle);
      }, [client, isRestoring]);
      return null;
    }
    render(
      <QueryProvider>
        <Seed />
      </QueryProvider>
    );

    // The persister writes on a one-second throttle.
    await waitFor(
      () => expect(localStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toContain("likes hills"),
      { timeout: 3000 }
    );
    expect(localStorage.getItem(QUERY_CACHE_STORAGE_KEY)).not.toContain("m1");
  });

  it("sends the user to /session-expired when the API keeps answering 401", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 }))
    );

    // In the app the route's error boundary catches the failed query.
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      render() {
        return this.state.failed ? <p>error</p> : this.props.children;
      }
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <QueryProvider>
        <Boundary>
          <CSRSuspense fallback={<p>loading</p>}>
            <Greeting />
          </CSRSuspense>
        </Boundary>
      </QueryProvider>
    );

    // One retry, a second apart, before the query gives up.
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/session-expired"), { timeout: 4000 });
  });
});
