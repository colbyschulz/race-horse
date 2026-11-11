"use client";

import { QueryCache, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { QUERY_CACHE_STORAGE_KEY } from "@/lib/query-cache-key";

const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

// Bump when the shape of any cached response changes, so a device holding the
// old shape drops it instead of rendering it.
const CACHE_VERSION = "1";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          // The tab pages are static, so the first API call is where a dead
          // session shows up. This fires only after the query's retry has
          // failed too, so one dropped request doesn't sign anyone out.
          onError: (error) => {
            if (error instanceof ApiError && error.status === 401) {
              window.location.assign("/session-expired");
            }
          },
        }),
        defaultOptions: {
          queries: {
            // Cached data paints immediately; anything older than a few seconds
            // is refetched in the background whenever a page shows it or the
            // app comes back to the foreground. The short window only stops
            // several components asking for the same thing in one burst.
            staleTime: 5_000,
            gcTime: CACHE_MAX_AGE,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      })
  );

  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: QUERY_CACHE_STORAGE_KEY,
    })
  );

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: CACHE_VERSION,
        dehydrateOptions: {
          // Coach conversations are large, change on every streamed step and
          // are always reloaded when the coach opens, so saving them would only
          // slow down every write of the cache.
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            !(query.queryKey[0] === "coach" && query.queryKey[1] === "messages"),
        },
      }}
    >
      {children}
      {process.env.NODE_ENV !== "production" && <ReactQueryDevtools initialIsOpen={false} />}
    </PersistQueryClientProvider>
  );
}
