# Phase 2: Strava Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Strava activity sync — `getStravaToken` with auto-refresh, `activities`/`activity_laps` schema, 90-day initial backfill on first sign-in, manual sync endpoint, and a webhook receiver that processes activity create/update/delete and athlete deauth events. Phase 3 (Plans) builds the workout schema; Phase 5 wires up activity-to-workout matching using the data this phase ingests.

**Architecture:** A `src/strava/` module owns all Strava API interactions:

- `client.ts` — fetch wrapper with rate-limit-aware backoff (handles 429 + 5xx)
- `token.ts` — `getStravaToken(userId)` reads `accounts`, refreshes if `expires_at` is within 60s of now, persists the new tokens
- `types.ts` — TS shapes for the bits of Strava's response we care about
- `normalize.ts` — pure functions mapping Strava summary/detailed activities and laps to our schema rows
- `upsert.ts` — idempotent `INSERT … ON CONFLICT (strava_id) DO UPDATE` for activities; `DELETE + INSERT` for laps (cheap and correct since laps are a child collection)
- `sync.ts` — orchestrator that paginates `/athlete/activities`, fetches detail + laps for `Run`/`Ride`/`VirtualRide`, and writes them via the upserter
- `webhook.ts` — pure event-handling logic separated from the route so it's unit-testable

API routes: `/api/strava/sync` (POST — authed, manual user-triggered 7-day backfill); `/api/strava/webhook` (GET — subscription verification challenge; POST — event delivery from Strava); `/api/strava/subscribe` (admin-only, gated by `ADMIN_API_TOKEN` header — manages the single Strava push subscription for the deployment).

Initial backfill is triggered from the `(app)` layout when `users.last_synced_at` is null, kicked off via Vercel `after()` so the layout responds immediately. A small client banner polls `last_synced_at` until it flips non-null and then disappears.

**Tech Stack:**

- Strava API v3 (`https://www.strava.com/api/v3`)
- Vercel `after()` from `next/server` for fire-and-forget background work
- Existing: Next.js 16 + Drizzle + Neon + NextAuth v5 + Vitest

---

## File structure

**Create:**

- `src/strava/client.ts` — fetch wrapper
- `src/strava/token.ts` — `getStravaToken(userId)`
- `src/strava/types.ts` — Strava API response types
- `src/strava/normalize.ts` — Strava → schema row mappers
- `src/strava/upsert.ts` — DB upsert helpers
- `src/strava/sync.ts` — backfill / incremental orchestrator
- `src/strava/webhook.ts` — event-handling logic
- `src/strava/__tests__/*.test.ts` — unit tests for each module
- `src/app/api/strava/sync/route.ts` — manual sync endpoint
- `src/app/api/strava/sync/__tests__/route.test.ts`
- `src/app/api/strava/webhook/route.ts` — webhook receiver
- `src/app/api/strava/webhook/__tests__/route.test.ts`
- `src/app/api/strava/subscribe/route.ts` — admin subscription mgmt
- `src/components/SyncStatusBanner.tsx` — first-login "syncing" banner
- `src/app/api/strava/sync-status/route.ts` — small GET endpoint the banner polls

**Modify:**

- `src/db/schema.ts` — add `activities`, `activity_laps` tables, add `last_synced_at` column to `users`
- `src/db/__tests__/schema.test.ts` — extend to cover new schema
- `src/app/(app)/layout.tsx` — wire up `SyncStatusBanner` + initial backfill kickoff

---

## External setup (manual — most can be deferred until production deploy)

1. **`STRAVA_VERIFY_TOKEN`** (required for webhook subscription)
   - Generate: `openssl rand -hex 16`
   - Add to `.env.local`. This is a shared secret between us and Strava — Strava sends it back during subscription verification so we can confirm the request came from a legitimate subscribe call we made.

2. **`ADMIN_API_TOKEN`** (required for `/api/strava/subscribe`)
   - Generate: `openssl rand -hex 32`
   - Add to `.env.local`. Used in an `Authorization: Bearer <token>` header to gate the subscription admin endpoint (so a random visitor can't create/delete the deployment's Strava webhook subscription).

3. **Production Strava app** (defer until deploying with webhooks)
   - Create a second Strava app at https://www.strava.com/settings/api with `Authorization Callback Domain: <your-prod-domain>`. Strava only allows one active webhook subscription per app, so dev/prod each get their own app.

4. **(Optional) ngrok or cloudflared tunnel** (only if you want to test webhooks against local dev)
   - `ngrok http 3000` → use the HTTPS URL when calling `POST /api/strava/subscribe` from the dev environment.
   - You can finish Phase 2 without this — backfill + manual sync work without a live webhook.

Add to `.env.local`:

```
STRAVA_VERIFY_TOKEN=<output of openssl rand -hex 16>
ADMIN_API_TOKEN=<output of openssl rand -hex 32>
```

---

## Task 1: Schema — activities, activity_laps, users.last_synced_at

**Files:**

- Modify: `src/db/schema.ts`
- Modify: `src/db/__tests__/schema.test.ts`
- Generate: `drizzle/<timestamp>_phase2_strava_sync.sql`

- [ ] **Step 1: Write failing schema tests**

Add to `src/db/__tests__/schema.test.ts` (preserve existing tests):

```ts
import { describe, it, expect } from "vitest";
import { users, accounts, sessions, verificationTokens, activities, activityLaps } from "../schema";
import { getTableConfig } from "drizzle-orm/pg-core";

// ...keep existing describe block...

describe("activities schema", () => {
  it("activity table is named 'activity' and has expected columns", () => {
    const cfg = getTableConfig(activities);
    expect(cfg.name).toBe("activity");
    const names = cfg.columns.map((c) => c.name);
    for (const col of [
      "id",
      "userId",
      "strava_id",
      "start_date",
      "name",
      "type",
      "distance_meters",
      "moving_time_seconds",
      "elapsed_time_seconds",
      "avg_hr",
      "max_hr",
      "avg_pace_seconds_per_km",
      "avg_power_watts",
      "elevation_gain_m",
      "raw",
      "created_at",
      "updated_at",
    ]) {
      expect(names, `expected column ${col}`).toContain(col);
    }
  });

  it("strava_id is unique", () => {
    const cfg = getTableConfig(activities);
    const stravaId = cfg.columns.find((c) => c.name === "strava_id");
    expect(stravaId?.isUnique).toBe(true);
  });

  it("activity_lap table has activity_id fk and lap_index", () => {
    const cfg = getTableConfig(activityLaps);
    expect(cfg.name).toBe("activity_lap");
    const names = cfg.columns.map((c) => c.name);
    for (const col of [
      "id",
      "activity_id",
      "lap_index",
      "distance_meters",
      "moving_time_seconds",
      "elapsed_time_seconds",
      "avg_pace_seconds_per_km",
      "avg_power_watts",
      "avg_hr",
      "max_hr",
      "elevation_gain_m",
      "start_index",
      "end_index",
    ]) {
      expect(names, `expected column ${col}`).toContain(col);
    }
  });

  it("user table has last_synced_at nullable timestamp", () => {
    const cols = getTableConfig(users).columns;
    const last = cols.find((c) => c.name === "last_synced_at");
    expect(last).toBeDefined();
    expect(last?.notNull).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test -- src/db
```

Expected: failures referring to missing exports `activities` / `activityLaps` and missing `last_synced_at` column.

- [ ] **Step 3: Add the columns + tables to schema.ts**

Open `src/db/schema.ts`. Add `bigint`, `numeric`, `index` to the `pg-core` import. At the end of the file:

```ts
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  jsonb,
  uuid,
  bigint,
  numeric,
  index,
} from "drizzle-orm/pg-core";
```

Add `last_synced_at` to the existing `users` table (between `coach_notes` and the closing brace):

```ts
export const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  preferences: jsonb("preferences").$type<UserPreferences>().default(DEFAULT_PREFERENCES).notNull(),
  coach_notes: text("coach_notes").notNull().default(""),
  last_synced_at: timestamp("last_synced_at", {
    withTimezone: true,
    mode: "date",
  }),
});
```

Append the two new tables at the bottom of the file:

```ts
export const activities = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    strava_id: bigint("strava_id", { mode: "number" }).notNull().unique(),
    start_date: timestamp("start_date", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    distance_meters: numeric("distance_meters"),
    moving_time_seconds: integer("moving_time_seconds"),
    elapsed_time_seconds: integer("elapsed_time_seconds"),
    avg_hr: numeric("avg_hr"),
    max_hr: numeric("max_hr"),
    avg_pace_seconds_per_km: numeric("avg_pace_seconds_per_km"),
    avg_power_watts: numeric("avg_power_watts"),
    elevation_gain_m: numeric("elevation_gain_m"),
    raw: jsonb("raw").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_user_start_idx").on(t.userId, t.start_date)]
);

export const activityLaps = pgTable(
  "activity_lap",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activity_id: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    lap_index: integer("lap_index").notNull(),
    distance_meters: numeric("distance_meters").notNull(),
    moving_time_seconds: integer("moving_time_seconds").notNull(),
    elapsed_time_seconds: integer("elapsed_time_seconds").notNull(),
    avg_pace_seconds_per_km: numeric("avg_pace_seconds_per_km"),
    avg_power_watts: numeric("avg_power_watts"),
    avg_hr: numeric("avg_hr"),
    max_hr: numeric("max_hr"),
    elevation_gain_m: numeric("elevation_gain_m"),
    start_index: integer("start_index"),
    end_index: integer("end_index"),
  },
  (t) => [index("activity_lap_activity_idx").on(t.activity_id, t.lap_index)]
);
```

- [ ] **Step 4: Re-run schema tests**

```bash
pnpm test -- src/db
```

Expected: all schema tests green.

- [ ] **Step 5: Generate the migration**

```bash
pnpm db:generate
```

Inspect the generated SQL under `drizzle/`. It should add `last_synced_at` to `user`, create the `activity` and `activity_lap` tables, and create both indexes. There must be no surprise `DROP` statements against existing tables.

- [ ] **Step 6: Apply the migration to your dev DB**

```bash
pnpm db:migrate
```

Verify by opening Drizzle Studio (`pnpm db:studio`) and confirming the new tables exist and `user.last_synced_at` is present.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/__tests__/schema.test.ts drizzle/
git commit -m "Add activities, activity_laps, last_synced_at schema for Phase 2 sync"
```

---

## Task 2: Strava API types

**Files:**

- Create: `src/strava/types.ts`

This is types-only; no test needed. The shape is exercised by Tasks 3–5.

- [ ] **Step 1: Write the type module**

Create `src/strava/types.ts`:

```ts
// Subset of Strava API responses we actually consume.
// Strava docs: https://developers.strava.com/docs/reference/

export type StravaActivityType =
  | "Run"
  | "Ride"
  | "VirtualRide"
  | "Walk"
  | "Hike"
  | "Swim"
  | "Workout"
  | (string & {}); // accept anything else as opaque string

export interface StravaSummaryActivity {
  id: number;
  name: string;
  type: StravaActivityType;
  start_date: string; // ISO 8601 UTC
  start_date_local?: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  average_speed?: number; // m/s
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  has_heartrate?: boolean;
  average_watts?: number;
  device_watts?: boolean;
}

export interface StravaLap {
  id: number;
  lap_index: number;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  average_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  total_elevation_gain?: number;
  start_index?: number;
  end_index?: number;
}

export interface StravaDetailedActivity extends StravaSummaryActivity {
  laps?: StravaLap[];
}

export interface StravaTokenResponse {
  token_type: "Bearer";
  expires_at: number; // unix seconds
  expires_in: number; // seconds until expiry
  refresh_token: string;
  access_token: string;
}

// Webhook event payloads — see https://developers.strava.com/docs/webhooks/
export interface StravaWebhookEvent {
  aspect_type: "create" | "update" | "delete";
  event_time: number; // unix seconds
  object_id: number;
  object_type: "activity" | "athlete";
  owner_id: number; // Strava athlete id
  subscription_id: number;
  updates?: Record<string, string | boolean>;
}
```

- [ ] **Step 2: Confirm it compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/strava/types.ts
git commit -m "Add Strava API response types"
```

---

## Task 3: Strava fetch wrapper with rate-limit handling

**Files:**

- Create: `src/strava/client.ts`
- Create: `src/strava/__tests__/client.test.ts`

The wrapper is the only place we call `fetch` against Strava. Centralizes auth header, JSON parsing, and 429/5xx retry-with-backoff so callers stay simple.

- [ ] **Step 1: Write the failing test**

Create `src/strava/__tests__/client.test.ts`:

```ts
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
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const result = await fetchStrava<{ ok: boolean }>("/athlete", "tok123");
    expect(result).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://www.strava.com/api/v3/athlete",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok123",
        }),
      })
    );
  });

  it("appends query params correctly", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("[]", { status: 200 })
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
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
      new Response("nope", { status: 404 })
    );
    await expect(fetchStrava("/missing", "tok")).rejects.toMatchObject({
      status: 404,
    });
  });
});
```

- [ ] **Step 2: Run the test (should fail — no module yet)**

```bash
pnpm test -- src/strava/__tests__/client.test.ts
```

Expected: failure (module does not exist).

- [ ] **Step 3: Implement the wrapper**

Create `src/strava/client.ts`:

```ts
const STRAVA_BASE = "https://www.strava.com/api/v3";

export class StravaApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public url: string
  ) {
    super(`Strava API ${status} on ${url}: ${body.slice(0, 200)}`);
  }
}

interface FetchStravaOptions {
  params?: Record<string, string | number | undefined>;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  maxRetries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchStrava<T>(
  path: string,
  token: string,
  opts: FetchStravaOptions = {}
): Promise<T> {
  const { params, method = "GET", body, maxRetries = 4, baseDelayMs = 500, signal } = opts;

  let url = STRAVA_BASE + path;
  if (params) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      search.set(k, String(v));
    }
    const qs = search.toString();
    if (qs) url += "?" + qs;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (e) {
      lastErr = e;
      if (attempt === maxRetries) throw e;
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }

    if (res.ok) {
      // Strava returns 204 for some delete-like calls.
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return text ? (JSON.parse(text) as T) : (undefined as T);
    }

    const isRetryable = res.status === 429 || res.status >= 500;
    if (!isRetryable || attempt === maxRetries) {
      throw new StravaApiError(res.status, await res.text(), url);
    }
    await sleep(baseDelayMs * 2 ** attempt);
  }

  throw lastErr ?? new Error("fetchStrava: exhausted retries");
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test -- src/strava/__tests__/client.test.ts
```

Expected: all four cases green.

- [ ] **Step 5: Commit**

```bash
git add src/strava/client.ts src/strava/__tests__/client.test.ts
git commit -m "Add Strava fetch wrapper with rate-limit-aware backoff"
```

---

## Task 4: getStravaToken with auto-refresh

**Files:**

- Create: `src/strava/token.ts`
- Create: `src/strava/__tests__/token.test.ts`

Reads the user's Strava `accounts` row. If `expires_at` is within 60s of now, calls Strava's token endpoint to refresh and persists the new tokens before returning the access token.

- [ ] **Step 1: Write the failing test**

Create `src/strava/__tests__/token.test.ts`:

```ts
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
        { status: 200 }
      )
    );
    updateMock.mockResolvedValueOnce(undefined);

    const tok = await getStravaToken("user-1");
    expect(tok).toBe("new");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://www.strava.com/api/v3/oauth/token",
      expect.objectContaining({ method: "POST" })
    );
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("throws when no Strava account row exists", async () => {
    selectMock.mockResolvedValueOnce([]);
    await expect(getStravaToken("user-x")).rejects.toThrow(/no strava account/i);
  });
});
```

- [ ] **Step 2: Run the test (fails — module missing)**

```bash
pnpm test -- src/strava/__tests__/token.test.ts
```

- [ ] **Step 3: Implement getStravaToken**

Create `src/strava/token.ts`:

```ts
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { StravaTokenResponse } from "./types";

const REFRESH_THRESHOLD_SECONDS = 60;
const STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token";

export async function getStravaToken(userId: string): Promise<string> {
  const rows = await db
    .select({
      access_token: accounts.access_token,
      refresh_token: accounts.refresh_token,
      expires_at: accounts.expires_at,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "strava")))
    .limit(1);

  const row = rows[0];
  if (!row || !row.access_token || !row.refresh_token || !row.expires_at) {
    throw new Error(`No Strava account for user ${userId}`);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (row.expires_at - nowSec > REFRESH_THRESHOLD_SECONDS) {
    return row.access_token;
  }

  const clientId = process.env.AUTH_STRAVA_ID;
  const clientSecret = process.env.AUTH_STRAVA_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AUTH_STRAVA_ID / AUTH_STRAVA_SECRET not configured");
  }

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as StravaTokenResponse;

  await db
    .update(accounts)
    .set({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: json.expires_at,
      token_type: json.token_type,
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "strava")));

  return json.access_token;
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test -- src/strava/__tests__/token.test.ts
```

Expected: all three cases green.

- [ ] **Step 5: Commit**

```bash
git add src/strava/token.ts src/strava/__tests__/token.test.ts
git commit -m "Add getStravaToken with auto-refresh"
```

---

## Task 5: Normalize Strava activity + lap responses to schema rows

**Files:**

- Create: `src/strava/normalize.ts`
- Create: `src/strava/__tests__/normalize.test.ts`

Pure functions, fully unit-testable. Convert Strava API shapes to the column shapes our DB expects, including pace calculation (`1000 / average_speed` to convert m/s → s/km).

- [ ] **Step 1: Write the failing test**

Create `src/strava/__tests__/normalize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeActivity, normalizeLap } from "../normalize";
import type { StravaSummaryActivity, StravaDetailedActivity, StravaLap } from "../types";

const sample: StravaSummaryActivity = {
  id: 9999,
  name: "Easy run",
  type: "Run",
  start_date: "2026-04-25T15:00:00Z",
  distance: 8000,
  moving_time: 2400,
  elapsed_time: 2500,
  total_elevation_gain: 60,
  average_speed: 3.33,
  average_heartrate: 145,
  max_heartrate: 160,
};

describe("normalizeActivity", () => {
  it("maps required fields and converts speed → s/km pace", () => {
    const row = normalizeActivity(sample, "user-1");
    expect(row.userId).toBe("user-1");
    expect(row.strava_id).toBe(9999);
    expect(row.name).toBe("Easy run");
    expect(row.type).toBe("Run");
    expect(row.distance_meters).toBe("8000");
    expect(row.moving_time_seconds).toBe(2400);
    expect(row.elapsed_time_seconds).toBe(2500);
    expect(row.elevation_gain_m).toBe("60");
    expect(row.avg_hr).toBe("145");
    expect(row.max_hr).toBe("160");
    expect(row.start_date).toBeInstanceOf(Date);
    expect(row.start_date.toISOString()).toBe("2026-04-25T15:00:00.000Z");
    // 1000 / 3.33 ≈ 300.30
    expect(Number(row.avg_pace_seconds_per_km)).toBeCloseTo(300.3, 1);
    expect(row.raw).toEqual(sample);
  });

  it("leaves nullable fields null when absent", () => {
    const minimal: StravaSummaryActivity = {
      id: 1,
      name: "x",
      type: "Workout",
      start_date: "2026-04-01T00:00:00Z",
      distance: 0,
      moving_time: 0,
      elapsed_time: 0,
      total_elevation_gain: 0,
    };
    const row = normalizeActivity(minimal, "u");
    expect(row.avg_hr).toBeNull();
    expect(row.max_hr).toBeNull();
    expect(row.avg_pace_seconds_per_km).toBeNull();
    expect(row.avg_power_watts).toBeNull();
  });

  it("captures average_watts for rides", () => {
    const ride: StravaDetailedActivity = {
      ...sample,
      type: "Ride",
      average_watts: 220,
      device_watts: true,
    };
    const row = normalizeActivity(ride, "u");
    expect(row.avg_power_watts).toBe("220");
  });
});

describe("normalizeLap", () => {
  it("maps lap fields and pace conversion", () => {
    const lap: StravaLap = {
      id: 1,
      lap_index: 1,
      distance: 1000,
      moving_time: 300,
      elapsed_time: 305,
      average_speed: 3.33,
      average_heartrate: 150,
      max_heartrate: 165,
      total_elevation_gain: 5,
      start_index: 0,
      end_index: 600,
    };
    const row = normalizeLap(lap, "activity-uuid");
    expect(row.activity_id).toBe("activity-uuid");
    expect(row.lap_index).toBe(1);
    expect(row.distance_meters).toBe("1000");
    expect(row.moving_time_seconds).toBe(300);
    expect(Number(row.avg_pace_seconds_per_km)).toBeCloseTo(300.3, 1);
    expect(row.start_index).toBe(0);
    expect(row.end_index).toBe(600);
  });
});
```

- [ ] **Step 2: Run the test (fails)**

```bash
pnpm test -- src/strava/__tests__/normalize.test.ts
```

- [ ] **Step 3: Implement normalize.ts**

Create `src/strava/normalize.ts`:

```ts
import type { StravaDetailedActivity, StravaLap, StravaSummaryActivity } from "./types";

// Drizzle's `numeric` columns round-trip as strings to preserve precision.
// We mirror that here so callers can pass the result straight to .insert().
type NumericString = string;

export interface ActivityInsertRow {
  userId: string;
  strava_id: number;
  start_date: Date;
  name: string;
  type: string;
  distance_meters: NumericString | null;
  moving_time_seconds: number | null;
  elapsed_time_seconds: number | null;
  avg_hr: NumericString | null;
  max_hr: NumericString | null;
  avg_pace_seconds_per_km: NumericString | null;
  avg_power_watts: NumericString | null;
  elevation_gain_m: NumericString | null;
  raw: unknown;
}

export interface LapInsertRow {
  activity_id: string;
  lap_index: number;
  distance_meters: NumericString;
  moving_time_seconds: number;
  elapsed_time_seconds: number;
  avg_pace_seconds_per_km: NumericString | null;
  avg_power_watts: NumericString | null;
  avg_hr: NumericString | null;
  max_hr: NumericString | null;
  elevation_gain_m: NumericString | null;
  start_index: number | null;
  end_index: number | null;
}

const num = (v: number | undefined | null): NumericString | null =>
  v === undefined || v === null ? null : String(v);

const paceFromSpeed = (metersPerSecond: number | undefined): NumericString | null => {
  if (!metersPerSecond || metersPerSecond <= 0) return null;
  return (1000 / metersPerSecond).toFixed(2);
};

export function normalizeActivity(
  a: StravaSummaryActivity | StravaDetailedActivity,
  userId: string
): ActivityInsertRow {
  return {
    userId,
    strava_id: a.id,
    start_date: new Date(a.start_date),
    name: a.name,
    type: a.type,
    distance_meters: num(a.distance),
    moving_time_seconds: a.moving_time ?? null,
    elapsed_time_seconds: a.elapsed_time ?? null,
    avg_hr: num(a.average_heartrate),
    max_hr: num(a.max_heartrate),
    avg_pace_seconds_per_km: paceFromSpeed(a.average_speed),
    avg_power_watts: num(a.average_watts),
    elevation_gain_m: num(a.total_elevation_gain),
    raw: a,
  };
}

export function normalizeLap(lap: StravaLap, activityId: string): LapInsertRow {
  return {
    activity_id: activityId,
    lap_index: lap.lap_index,
    distance_meters: String(lap.distance),
    moving_time_seconds: lap.moving_time,
    elapsed_time_seconds: lap.elapsed_time,
    avg_pace_seconds_per_km: paceFromSpeed(lap.average_speed),
    avg_power_watts: num(lap.average_watts),
    avg_hr: num(lap.average_heartrate),
    max_hr: num(lap.max_heartrate),
    elevation_gain_m: num(lap.total_elevation_gain),
    start_index: lap.start_index ?? null,
    end_index: lap.end_index ?? null,
  };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test -- src/strava/__tests__/normalize.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/strava/normalize.ts src/strava/__tests__/normalize.test.ts
git commit -m "Add normalizers for Strava activities + laps"
```

---

## Task 6: Activity + lap upsert

**Files:**

- Create: `src/strava/upsert.ts`
- Create: `src/strava/__tests__/upsert.test.ts`

`upsertActivity` does `INSERT … ON CONFLICT (strava_id) DO UPDATE` and returns the row's `id`. `replaceLaps(activityId, laps)` does `DELETE WHERE activity_id = ? + INSERT [...]` inside a transaction so reruns don't accumulate duplicates.

- [ ] **Step 1: Write the failing test**

Create `src/strava/__tests__/upsert.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};
const insertLapsChain = {
  values: vi.fn().mockResolvedValue(undefined),
};
const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };

const txMock = {
  insert: vi.fn(),
  delete: vi.fn(() => deleteChain),
};

vi.mock("@/db", () => ({
  db: {
    transaction: (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
    insert: () => insertChain,
  },
}));
vi.mock("@/db/schema", () => ({
  activities: { id: "id", strava_id: "strava_id" },
  activityLaps: { activity_id: "activity_id" },
}));

import { upsertActivity, replaceLaps } from "../upsert";
import type { ActivityInsertRow, LapInsertRow } from "../normalize";

describe("upsertActivity", () => {
  beforeEach(() => {
    insertChain.values.mockClear().mockReturnThis();
    insertChain.onConflictDoUpdate.mockClear().mockReturnThis();
    insertChain.returning.mockReset();
  });

  it("inserts with ON CONFLICT (strava_id) DO UPDATE and returns id", async () => {
    insertChain.returning.mockResolvedValueOnce([{ id: "act-uuid" }]);
    const row: ActivityInsertRow = {
      userId: "u1",
      strava_id: 1,
      start_date: new Date(),
      name: "n",
      type: "Run",
      distance_meters: "1",
      moving_time_seconds: 1,
      elapsed_time_seconds: 1,
      avg_hr: null,
      max_hr: null,
      avg_pace_seconds_per_km: null,
      avg_power_watts: null,
      elevation_gain_m: null,
      raw: {},
    };
    const id = await upsertActivity(row);
    expect(id).toBe("act-uuid");
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
  });
});

describe("replaceLaps", () => {
  beforeEach(() => {
    txMock.insert.mockReset();
    txMock.delete.mockClear();
    deleteChain.where.mockClear();
    insertLapsChain.values.mockClear().mockResolvedValue(undefined);
  });

  it("deletes existing laps and inserts new ones in a transaction", async () => {
    txMock.insert.mockReturnValue(insertLapsChain);
    const laps: LapInsertRow[] = [
      {
        activity_id: "act-1",
        lap_index: 1,
        distance_meters: "1000",
        moving_time_seconds: 300,
        elapsed_time_seconds: 305,
        avg_pace_seconds_per_km: null,
        avg_power_watts: null,
        avg_hr: null,
        max_hr: null,
        elevation_gain_m: null,
        start_index: null,
        end_index: null,
      },
    ];
    await replaceLaps("act-1", laps);
    expect(txMock.delete).toHaveBeenCalledOnce();
    expect(deleteChain.where).toHaveBeenCalledOnce();
    expect(insertLapsChain.values).toHaveBeenCalledWith(laps);
  });

  it("is a no-op insert when laps array is empty (still deletes)", async () => {
    await replaceLaps("act-1", []);
    expect(txMock.delete).toHaveBeenCalled();
    expect(txMock.insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test (fails)**

```bash
pnpm test -- src/strava/__tests__/upsert.test.ts
```

- [ ] **Step 3: Implement upsert.ts**

Create `src/strava/upsert.ts`:

```ts
import { db } from "@/db";
import { activities, activityLaps } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ActivityInsertRow, LapInsertRow } from "./normalize";

export async function upsertActivity(row: ActivityInsertRow): Promise<string> {
  const result = await db
    .insert(activities)
    .values({ ...row, updated_at: new Date() })
    .onConflictDoUpdate({
      target: activities.strava_id,
      set: {
        name: row.name,
        type: row.type,
        start_date: row.start_date,
        distance_meters: row.distance_meters,
        moving_time_seconds: row.moving_time_seconds,
        elapsed_time_seconds: row.elapsed_time_seconds,
        avg_hr: row.avg_hr,
        max_hr: row.max_hr,
        avg_pace_seconds_per_km: row.avg_pace_seconds_per_km,
        avg_power_watts: row.avg_power_watts,
        elevation_gain_m: row.elevation_gain_m,
        raw: row.raw,
        updated_at: new Date(),
      },
    })
    .returning({ id: activities.id });

  return result[0].id;
}

export async function replaceLaps(activityId: string, laps: LapInsertRow[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(activityLaps).where(eq(activityLaps.activity_id, activityId));
    if (laps.length > 0) {
      await tx.insert(activityLaps).values(laps);
    }
  });
}

export async function deleteActivityByStravaId(stravaId: number): Promise<void> {
  await db.delete(activities).where(eq(activities.strava_id, stravaId));
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test -- src/strava/__tests__/upsert.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/strava/upsert.ts src/strava/__tests__/upsert.test.ts
git commit -m "Add idempotent activity + lap upsert"
```

---

## Task 7: Sync orchestrator (paginate + fetch detail + write)

**Files:**

- Create: `src/strava/sync.ts`
- Create: `src/strava/__tests__/sync.test.ts`

`syncActivities({ userId, sinceDate })` paginates `/athlete/activities?per_page=200&after=<unix>`, upserts each summary, and for `Run`/`Ride`/`VirtualRide` fetches `/activities/{id}?include_all_efforts=true` to get laps and replaces them.

- [ ] **Step 1: Write the failing test**

Create `src/strava/__tests__/sync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../token", () => ({
  getStravaToken: vi.fn().mockResolvedValue("tok"),
}));
const fetchStravaMock = vi.fn();
vi.mock("../client", () => ({ fetchStrava: (...args: unknown[]) => fetchStravaMock(...args) }));
const upsertActivityMock = vi.fn();
const replaceLapsMock = vi.fn();
vi.mock("../upsert", () => ({
  upsertActivity: (...a: unknown[]) => upsertActivityMock(...a),
  replaceLaps: (...a: unknown[]) => replaceLapsMock(...a),
}));

import { syncActivities, LIST_PAGE_SIZE } from "../sync";

describe("syncActivities", () => {
  beforeEach(() => {
    fetchStravaMock.mockReset();
    upsertActivityMock.mockReset();
    replaceLapsMock.mockReset();
  });

  const baseSummary = {
    id: 1,
    name: "n",
    type: "Run" as const,
    start_date: "2026-04-20T00:00:00Z",
    distance: 1,
    moving_time: 1,
    elapsed_time: 1,
    total_elevation_gain: 1,
  };

  it("paginates until an empty page is returned", async () => {
    fetchStravaMock
      .mockResolvedValueOnce([
        { ...baseSummary, id: 1 },
        { ...baseSummary, id: 2 },
      ])
      .mockResolvedValueOnce({ ...baseSummary, id: 1, laps: [] }) // detail for id 1
      .mockResolvedValueOnce({ ...baseSummary, id: 2, laps: [] }) // detail for id 2
      .mockResolvedValueOnce([]); // second list page empty

    upsertActivityMock.mockResolvedValue("act-uuid");

    const result = await syncActivities({
      userId: "u1",
      sinceDate: new Date("2026-01-01T00:00:00Z"),
    });

    expect(result.upserted).toBe(2);
    expect(result.pages).toBe(2);
    expect(upsertActivityMock).toHaveBeenCalledTimes(2);
    expect(replaceLapsMock).toHaveBeenCalledTimes(2);
    // first call should be a list call to /athlete/activities
    expect(fetchStravaMock.mock.calls[0][0]).toBe("/athlete/activities");
    expect(fetchStravaMock.mock.calls[0][2]).toMatchObject({
      params: expect.objectContaining({ per_page: LIST_PAGE_SIZE, page: 1 }),
    });
  });

  it("skips lap fetch for non-run/ride activities", async () => {
    fetchStravaMock
      .mockResolvedValueOnce([{ ...baseSummary, type: "Walk" }])
      .mockResolvedValueOnce([]);
    upsertActivityMock.mockResolvedValue("act-uuid");

    const r = await syncActivities({
      userId: "u",
      sinceDate: new Date(),
    });
    expect(r.upserted).toBe(1);
    expect(replaceLapsMock).not.toHaveBeenCalled();
    // exactly two list fetches, no detail fetches
    expect(fetchStravaMock).toHaveBeenCalledTimes(2);
  });

  it("continues if one activity's detail fetch fails", async () => {
    fetchStravaMock
      .mockResolvedValueOnce([
        { ...baseSummary, id: 1 },
        { ...baseSummary, id: 2 },
      ])
      .mockRejectedValueOnce(new Error("strava boom"))
      .mockResolvedValueOnce({ ...baseSummary, id: 2, laps: [] })
      .mockResolvedValueOnce([]);
    upsertActivityMock.mockResolvedValue("uuid");

    const r = await syncActivities({ userId: "u", sinceDate: new Date() });
    expect(r.upserted).toBe(2);
    expect(r.detailFailures).toBe(1);
    expect(replaceLapsMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test (fails)**

```bash
pnpm test -- src/strava/__tests__/sync.test.ts
```

- [ ] **Step 3: Implement sync.ts**

Create `src/strava/sync.ts`:

```ts
import { fetchStrava } from "./client";
import { getStravaToken } from "./token";
import { normalizeActivity, normalizeLap } from "./normalize";
import { replaceLaps, upsertActivity } from "./upsert";
import type { StravaDetailedActivity, StravaSummaryActivity } from "./types";

export const LIST_PAGE_SIZE = 200;

const TYPES_WITH_LAPS = new Set(["Run", "Ride", "VirtualRide"]);

export interface SyncResult {
  upserted: number;
  detailFailures: number;
  pages: number;
}

export async function syncActivities(opts: {
  userId: string;
  sinceDate: Date;
}): Promise<SyncResult> {
  const token = await getStravaToken(opts.userId);
  const after = Math.floor(opts.sinceDate.getTime() / 1000);

  let page = 1;
  let upserted = 0;
  let detailFailures = 0;

  while (true) {
    const summaries = await fetchStrava<StravaSummaryActivity[]>("/athlete/activities", token, {
      params: { per_page: LIST_PAGE_SIZE, page, after },
    });
    if (!summaries.length) break;

    for (const summary of summaries) {
      const activityId = await upsertActivity(normalizeActivity(summary, opts.userId));
      upserted += 1;

      if (!TYPES_WITH_LAPS.has(summary.type)) continue;

      try {
        const detail = await fetchStrava<StravaDetailedActivity>(
          `/activities/${summary.id}`,
          token,
          { params: { include_all_efforts: "true" } }
        );
        // upsert again with the richer detail (overwrites raw + any newly-present fields)
        await upsertActivity(normalizeActivity(detail, opts.userId));
        const laps = (detail.laps ?? []).map((l) => normalizeLap(l, activityId));
        await replaceLaps(activityId, laps);
      } catch (err) {
        detailFailures += 1;
        console.error("strava detail fetch failed", summary.id, err);
      }
    }

    if (summaries.length < LIST_PAGE_SIZE) break;
    page += 1;
  }

  return { upserted, detailFailures, pages: page };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test -- src/strava/__tests__/sync.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/strava/sync.ts src/strava/__tests__/sync.test.ts
git commit -m "Add Strava sync orchestrator with pagination and detail fetch"
```

---

## Task 8: Manual sync endpoint POST /api/strava/sync

**Files:**

- Create: `src/app/api/strava/sync/route.ts`
- Create: `src/app/api/strava/sync/__tests__/route.test.ts`

Authed endpoint. Triggers a 7-day sync window (manual mode) for the calling user; updates `users.last_synced_at` on success. The handler returns immediately with `{ ok: true }` and lets the sync run in the background via `after()`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/strava/sync/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));

const updateMock = vi.fn();
vi.mock("@/db", () => ({
  db: { update: () => ({ set: () => ({ where: updateMock }) }) },
}));
vi.mock("@/db/schema", () => ({ users: { id: "id" } }));

const syncActivitiesMock = vi.fn();
vi.mock("@/strava/sync", () => ({
  syncActivities: (...a: unknown[]) => syncActivitiesMock(...a),
}));

const afterMock = vi.fn((fn: () => unknown) => Promise.resolve(fn()));
vi.mock("next/server", async (orig) => {
  const real = await orig<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => afterMock(fn) };
});

import { POST } from "../route";

describe("POST /api/strava/sync", () => {
  beforeEach(() => {
    authMock.mockReset();
    updateMock.mockReset().mockResolvedValue(undefined);
    syncActivitiesMock.mockReset().mockResolvedValue({
      upserted: 3,
      detailFailures: 0,
      pages: 1,
    });
    afterMock.mockClear();
  });

  it("returns 401 if unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(new Request("http://test"));
    expect(res.status).toBe(401);
  });

  it("schedules a 7-day sync via after() and returns 202", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(new Request("http://test"));
    expect(res.status).toBe(202);
    expect(afterMock).toHaveBeenCalledOnce();
    // wait for the deferred work
    await new Promise((r) => setImmediate(r));
    expect(syncActivitiesMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }));
    expect(updateMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test (fails)**

```bash
pnpm test -- src/app/api/strava/sync
```

- [ ] **Step 3: Implement the route**

Create `src/app/api/strava/sync/route.ts`:

```ts
import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncActivities } from "@/strava/sync";

const MANUAL_WINDOW_DAYS = 7;

export async function POST(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const sinceDate = new Date(Date.now() - MANUAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const startedAt = new Date();

  after(async () => {
    try {
      const r = await syncActivities({ userId, sinceDate });
      await db.update(users).set({ last_synced_at: startedAt }).where(eq(users.id, userId));
      console.log("manual sync done", { userId, ...r });
    } catch (err) {
      console.error("manual sync failed", userId, err);
    }
  });

  return NextResponse.json({ ok: true, scheduled: true, mode: "manual" }, { status: 202 });
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test -- src/app/api/strava/sync
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/strava/sync/
git commit -m "Add manual sync endpoint POST /api/strava/sync"
```

---

## Task 9: Initial backfill trigger + sync-status endpoint + banner

**Files:**

- Create: `src/app/api/strava/sync-status/route.ts`
- Create: `src/components/SyncStatusBanner.tsx`
- Create: `src/components/SyncStatusBanner.module.scss`
- Modify: `src/app/(app)/layout.tsx`

When the (app) layout renders for a user whose `users.last_synced_at` is null, kick off a 90-day backfill via `after()` and render the banner. The banner polls `GET /api/strava/sync-status` every 5s; once `last_synced_at` is non-null it disappears.

- [ ] **Step 1: Add the sync-status endpoint**

Create `src/app/api/strava/sync-status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select({ last_synced_at: users.last_synced_at })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return NextResponse.json({
    last_synced_at: rows[0]?.last_synced_at ?? null,
  });
}
```

- [ ] **Step 2: Add the banner component**

Create `src/components/SyncStatusBanner.module.scss`:

```scss
.banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  background: var(--color-brown-subtle);
  color: var(--color-brown);
  font-family: var(--font-body);
  font-size: 0.875rem;
  border-bottom: 1px solid var(--color-border-subtle);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-brown);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

Create `src/components/SyncStatusBanner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./SyncStatusBanner.module.scss";

interface Props {
  initialSynced: boolean;
}

export function SyncStatusBanner({ initialSynced }: Props) {
  const [synced, setSynced] = useState(initialSynced);

  useEffect(() => {
    if (synced) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/strava/sync-status");
        if (!res.ok) return;
        const data = (await res.json()) as { last_synced_at: string | null };
        if (data.last_synced_at) {
          setSynced(true);
          clearInterval(interval);
        }
      } catch {
        // ignore transient errors; next tick will retry
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [synced]);

  if (synced) return null;
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden />
      <span>Syncing your last 90 days from Strava…</span>
    </div>
  );
}
```

- [ ] **Step 3: Wire the layout to kick off the backfill and render the banner**

Read `src/app/(app)/layout.tsx`. It currently calls `auth()` and renders the shell. Modify it to:

1. After loading the user row, check `last_synced_at`.
2. If null, kick off `after(() => syncActivities({ userId, sinceDate: 90DaysAgo }))` and update `last_synced_at` after success.
3. Render `<SyncStatusBanner initialSynced={!!last_synced_at} />` above the existing shell.

A reference replacement (adapt to your current file's exact structure):

```tsx
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncActivities } from "@/strava/sync";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { AppShell } from "@/components/layout/AppShell";
import { PreferencesCapture } from "@/components/PreferencesCapture";

const INITIAL_BACKFILL_DAYS = 90;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const userId = session.user.id;
  const rows = await db
    .select({
      last_synced_at: users.last_synced_at,
      preferences: users.preferences,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const userRow = rows[0];

  if (userRow && userRow.last_synced_at === null) {
    const startedAt = new Date();
    const sinceDate = new Date(Date.now() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
    after(async () => {
      try {
        await syncActivities({ userId, sinceDate });
        await db.update(users).set({ last_synced_at: startedAt }).where(eq(users.id, userId));
      } catch (err) {
        console.error("initial backfill failed", userId, err);
      }
    });
  }

  return (
    <>
      <PreferencesCapture preferences={userRow?.preferences} />
      <SyncStatusBanner initialSynced={!!userRow?.last_synced_at} />
      <AppShell>{children}</AppShell>
    </>
  );
}
```

If your existing layout differs (e.g. doesn't currently call the DB), replace it as needed but **preserve** the auth redirect, the `PreferencesCapture` mount, and the `AppShell` wrapping.

- [ ] **Step 4: Verify by running the dev server and signing in fresh**

```bash
pnpm dev
```

- Open `http://localhost:3000`, sign in with Strava.
- Confirm the banner appears above the shell with "Syncing your last 90 days from Strava…".
- Wait. In a separate terminal: `pnpm db:studio`. Watch `activity` rows populate.
- After backfill finishes, `users.last_synced_at` flips non-null. The banner should disappear within ~5s without a page reload.

If you don't have any Strava activities in the last 90 days, the table will stay empty but `last_synced_at` will still flip.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm test
```

Expected: all green; previously written tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/strava/sync-status/ src/components/SyncStatusBanner.* src/app/\(app\)/layout.tsx
git commit -m "Trigger 90-day initial backfill on first sign-in with status banner"
```

---

## Task 10: Webhook event-handling logic (pure, testable)

**Files:**

- Create: `src/strava/webhook.ts`
- Create: `src/strava/__tests__/webhook.test.ts`

Pure handler that takes a parsed `StravaWebhookEvent` and routes it: activity create/update fetches detail + laps and upserts; activity delete removes the row by `strava_id`; athlete deauth (`object_type === "athlete"` with `updates.authorized === "false"`) clears that user's Strava tokens.

- [ ] **Step 1: Write the failing test**

Create `src/strava/__tests__/webhook.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchStravaMock = vi.fn();
const upsertActivityMock = vi.fn();
const replaceLapsMock = vi.fn();
const deleteActivityByStravaIdMock = vi.fn();
const getStravaTokenMock = vi.fn().mockResolvedValue("tok");
const updateMock = vi.fn();
const selectMock = vi.fn();

vi.mock("../client", () => ({ fetchStrava: (...a: unknown[]) => fetchStravaMock(...a) }));
vi.mock("../token", () => ({ getStravaToken: (...a: unknown[]) => getStravaTokenMock(...a) }));
vi.mock("../upsert", () => ({
  upsertActivity: (...a: unknown[]) => upsertActivityMock(...a),
  replaceLaps: (...a: unknown[]) => replaceLapsMock(...a),
  deleteActivityByStravaId: (...a: unknown[]) => deleteActivityByStravaIdMock(...a),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: selectMock }) }) }),
    update: () => ({ set: () => ({ where: updateMock }) }),
  },
}));
vi.mock("@/db/schema", () => ({
  accounts: { providerAccountId: "providerAccountId", provider: "provider" },
}));

import { handleWebhookEvent } from "../webhook";

describe("handleWebhookEvent", () => {
  beforeEach(() => {
    fetchStravaMock.mockReset();
    upsertActivityMock.mockReset().mockResolvedValue("uuid");
    replaceLapsMock.mockReset();
    deleteActivityByStravaIdMock.mockReset();
    getStravaTokenMock.mockReset().mockResolvedValue("tok");
    updateMock.mockReset();
    selectMock.mockReset();
  });

  const baseEvent = {
    aspect_type: "create" as const,
    event_time: 0,
    object_id: 100,
    object_type: "activity" as const,
    owner_id: 555,
    subscription_id: 1,
  };

  it("create → fetches detail and upserts activity + laps", async () => {
    selectMock.mockResolvedValueOnce([{ userId: "u-1" }]);
    fetchStravaMock.mockResolvedValueOnce({
      id: 100,
      name: "n",
      type: "Run",
      start_date: "2026-04-25T00:00:00Z",
      distance: 1,
      moving_time: 1,
      elapsed_time: 1,
      total_elevation_gain: 1,
      laps: [],
    });
    await handleWebhookEvent(baseEvent);
    expect(fetchStravaMock).toHaveBeenCalledWith(
      "/activities/100",
      "tok",
      expect.objectContaining({ params: { include_all_efforts: "true" } })
    );
    expect(upsertActivityMock).toHaveBeenCalledOnce();
    expect(replaceLapsMock).toHaveBeenCalledOnce();
  });

  it("delete activity → calls deleteActivityByStravaId", async () => {
    selectMock.mockResolvedValueOnce([{ userId: "u-1" }]);
    await handleWebhookEvent({ ...baseEvent, aspect_type: "delete" });
    expect(deleteActivityByStravaIdMock).toHaveBeenCalledWith(100);
    expect(fetchStravaMock).not.toHaveBeenCalled();
  });

  it("athlete deauth clears tokens", async () => {
    selectMock.mockResolvedValueOnce([{ userId: "u-1" }]);
    updateMock.mockResolvedValue(undefined);
    await handleWebhookEvent({
      ...baseEvent,
      object_type: "athlete",
      aspect_type: "update",
      updates: { authorized: "false" },
    });
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("ignores events for unknown athlete owner_id", async () => {
    selectMock.mockResolvedValueOnce([]);
    await handleWebhookEvent(baseEvent);
    expect(fetchStravaMock).not.toHaveBeenCalled();
    expect(upsertActivityMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test (fails)**

```bash
pnpm test -- src/strava/__tests__/webhook.test.ts
```

- [ ] **Step 3: Implement webhook.ts**

Create `src/strava/webhook.ts`:

```ts
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { fetchStrava } from "./client";
import { getStravaToken } from "./token";
import { normalizeActivity, normalizeLap } from "./normalize";
import { deleteActivityByStravaId, replaceLaps, upsertActivity } from "./upsert";
import type { StravaDetailedActivity, StravaWebhookEvent } from "./types";

async function userIdForStravaAthlete(athleteId: number): Promise<string | null> {
  const rows = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(and(eq(accounts.provider, "strava"), eq(accounts.providerAccountId, String(athleteId))))
    .limit(1);
  return rows[0]?.userId ?? null;
}

export async function handleWebhookEvent(event: StravaWebhookEvent): Promise<void> {
  const userId = await userIdForStravaAthlete(event.owner_id);
  if (!userId) {
    console.warn("strava webhook: unknown owner", event.owner_id);
    return;
  }

  if (event.object_type === "athlete") {
    if (event.updates?.authorized === "false") {
      await db
        .update(accounts)
        .set({
          access_token: null,
          refresh_token: null,
          expires_at: null,
        })
        .where(
          and(
            eq(accounts.provider, "strava"),
            eq(accounts.providerAccountId, String(event.owner_id))
          )
        );
    }
    return;
  }

  // object_type === "activity"
  if (event.aspect_type === "delete") {
    await deleteActivityByStravaId(event.object_id);
    return;
  }

  // create / update — fetch full detail + laps and upsert
  const token = await getStravaToken(userId);
  const detail = await fetchStrava<StravaDetailedActivity>(
    `/activities/${event.object_id}`,
    token,
    { params: { include_all_efforts: "true" } }
  );
  const activityId = await upsertActivity(normalizeActivity(detail, userId));
  const laps = (detail.laps ?? []).map((l) => normalizeLap(l, activityId));
  await replaceLaps(activityId, laps);
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test -- src/strava/__tests__/webhook.test.ts
```

Expected: all four cases green.

- [ ] **Step 5: Commit**

```bash
git add src/strava/webhook.ts src/strava/__tests__/webhook.test.ts
git commit -m "Add Strava webhook event-handling logic"
```

---

## Task 11: Webhook route — GET (verification) + POST (event delivery)

**Files:**

- Create: `src/app/api/strava/webhook/route.ts`
- Create: `src/app/api/strava/webhook/__tests__/route.test.ts`

GET handles Strava's subscription verification: `?hub.mode=subscribe&hub.challenge=<rand>&hub.verify_token=<our token>`. Verify the token matches `STRAVA_VERIFY_TOKEN`, echo the challenge.

POST receives event payloads. We must return 200 within ~2s, so we offload to `after()`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/strava/webhook/__tests__/route.test.ts`:

```ts
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
      })
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
      })
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test (fails)**

```bash
pnpm test -- src/app/api/strava/webhook
```

- [ ] **Step 3: Implement the route**

Create `src/app/api/strava/webhook/route.ts`:

```ts
import { NextResponse, after } from "next/server";
import { handleWebhookEvent } from "@/strava/webhook";
import type { StravaWebhookEvent } from "@/strava/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const expected = process.env.STRAVA_VERIFY_TOKEN;

  if (mode !== "subscribe" || !challenge || !expected || verifyToken !== expected) {
    return NextResponse.json({ error: "verification failed" }, { status: 403 });
  }
  return NextResponse.json({ "hub.challenge": challenge });
}

export async function POST(req: Request) {
  let event: StravaWebhookEvent;
  try {
    event = (await req.json()) as StravaWebhookEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  after(async () => {
    try {
      await handleWebhookEvent(event);
    } catch (err) {
      console.error("strava webhook handler failed", err);
    }
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test -- src/app/api/strava/webhook
```

Expected: all four green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/strava/webhook/
git commit -m "Add Strava webhook route — verification + event delivery"
```

---

## Task 12: Subscription admin endpoint POST/GET/DELETE /api/strava/subscribe

**Files:**

- Create: `src/app/api/strava/subscribe/route.ts`

One Strava push subscription per Strava app. This endpoint lets the deployment owner create / inspect / delete it. Gated by `Authorization: Bearer ${ADMIN_API_TOKEN}` so a public visitor can't manipulate it.

- [ ] **Step 1: Implement the route**

Create `src/app/api/strava/subscribe/route.ts`:

```ts
import { NextResponse } from "next/server";

const STRAVA_API = "https://www.strava.com/api/v3";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function checkAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${expected}`;
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// GET — list current subscriptions for the configured Strava app
export async function GET(req: Request) {
  if (!checkAdmin(req)) return unauthorized();
  const clientId = envOrThrow("AUTH_STRAVA_ID");
  const clientSecret = envOrThrow("AUTH_STRAVA_SECRET");
  const url = new URL(STRAVA_API + "/push_subscriptions");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  const res = await fetch(url);
  return NextResponse.json(await res.json(), { status: res.status });
}

// POST — create a subscription. Body: { callback_url }
export async function POST(req: Request) {
  if (!checkAdmin(req)) return unauthorized();
  const { callback_url } = (await req.json()) as { callback_url: string };
  if (!callback_url) {
    return NextResponse.json({ error: "callback_url required" }, { status: 400 });
  }
  const clientId = envOrThrow("AUTH_STRAVA_ID");
  const clientSecret = envOrThrow("AUTH_STRAVA_SECRET");
  const verifyToken = envOrThrow("STRAVA_VERIFY_TOKEN");

  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("callback_url", callback_url);
  form.set("verify_token", verifyToken);

  const res = await fetch(STRAVA_API + "/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

// DELETE — remove subscription by id. Body: { id }
export async function DELETE(req: Request) {
  if (!checkAdmin(req)) return unauthorized();
  const { id } = (await req.json()) as { id: number };
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const clientId = envOrThrow("AUTH_STRAVA_ID");
  const clientSecret = envOrThrow("AUTH_STRAVA_SECRET");

  const url = new URL(STRAVA_API + "/push_subscriptions/" + id);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);

  const res = await fetch(url, { method: "DELETE" });
  return NextResponse.json(res.status === 204 ? { ok: true } : await res.json().catch(() => ({})), {
    status: res.status,
  });
}
```

- [ ] **Step 2: Smoke test the GET endpoint locally**

With dev server running:

```bash
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3000/api/strava/subscribe
```

Expected: 200 with `[]` (no subscriptions for your dev Strava app yet) or whatever subscriptions exist.

Also verify auth gate works:

```bash
curl -i http://localhost:3000/api/strava/subscribe
```

Expected: 401.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/strava/subscribe/
git commit -m "Add admin endpoint for Strava push subscription management"
```

---

## Task 13: End-to-end smoke test — manual sync against real Strava

**Files:** none (manual verification)

This task requires real Strava credentials and a recent Strava activity in your account.

- [ ] **Step 1: Confirm `.env.local` has all required vars**

```
AUTH_SECRET=...
AUTH_STRAVA_ID=...
AUTH_STRAVA_SECRET=...
DATABASE_URL=...
STRAVA_VERIFY_TOKEN=...     # Task 11
ADMIN_API_TOKEN=...         # Task 12
```

- [ ] **Step 2: Run dev server fresh**

```bash
pnpm dev
```

- [ ] **Step 3: Sign in as a fresh user**

In Drizzle Studio, manually clear `last_synced_at` for your user row (set it back to `NULL`) to force a fresh backfill, OR sign up a new test Strava account.

- [ ] **Step 4: Verify backfill kicks off**

- Banner appears: "Syncing your last 90 days from Strava…"
- Watch the `activity` table fill up in Drizzle Studio. For Run/Ride activities, the corresponding `activity_lap` rows should also populate.
- Server logs should show no errors.
- After completion, `users.last_synced_at` is non-null and the banner disappears within ~5s.

- [ ] **Step 5: Verify manual sync**

```bash
curl -X POST http://localhost:3000/api/strava/sync \
  -H "Cookie: $(cat .next-auth-cookie)"  # OR just hit the button if you've added one
```

(Easier: drop a temp button into `/settings` that calls this. Optional — pure curl is fine.)

Expected: 202 response, then within a few seconds, `last_synced_at` updates again.

- [ ] **Step 6: Document gaps in PR**

Note any rate-limit hits, edge cases (e.g., activities without HR/power, activities with 100+ laps), and edge-case `type` values (Hike, EBikeRide, etc.) you encountered. These are useful breadcrumbs for Phase 5 (Today/Calendar) when we render the data.

---

## Self-review

Before handing off to subagent-driven-development, walk through this checklist:

1. **Spec coverage (§9 of the design spec):**
   - getStravaToken with refresh ✓ (Task 4)
   - 90-day initial backfill ✓ (Task 9)
   - 7-day manual sync ✓ (Task 8)
   - Webhook subscription verification ✓ (Task 11 GET)
   - Webhook event handling — activity create/update/delete ✓ (Task 10/11)
   - Webhook event handling — athlete deauth ✓ (Task 10)
   - Subscription mgmt (admin) ✓ (Task 12)
   - `activities` + `activity_laps` schema ✓ (Task 1)
   - Workout matching: **deferred to Phase 5** (matches the design spec's phasing — Today/Calendar is when matching becomes user-visible). Schema column for `matched_workout_id` will be added with the Phase 3/5 migrations alongside the `workouts` table.

2. **Type / signature consistency:**
   - `ActivityInsertRow` and `LapInsertRow` exported from `normalize.ts` and consumed by `upsert.ts` ✓
   - `StravaWebhookEvent` exported from `types.ts` and used by both `webhook.ts` and the route ✓
   - `LIST_PAGE_SIZE` exported from `sync.ts` for tests ✓

3. **No placeholders:** All steps include actual code or actual commands.

4. **Frequent commits:** One commit per task (12 commits for 12 implementation tasks + 1 manual verification).

5. **Subagent-friendliness:** Each task is self-contained — schema, code, tests, and verification steps live together. The subagent does not need to read other tasks to complete one.

---

## Execution handoff

Plan complete. After saving, suggest:

> Plan complete and saved to `docs/superpowers/plans/2026-04-26-phase-2-strava-sync.md`. Two execution options:
>
> 1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review per task
> 2. **Inline Execution** — execute tasks in this session with checkpoints
>
> Which approach?
