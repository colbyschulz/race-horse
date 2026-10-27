# Coach Chat Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop coach turns from silently vanishing when the client disconnects (navigation, app close) or when a large ad hoc request hits Vercel's 300s function ceiling, and let the user reconnect to see the finished reply pop in instead of a stuck or generic-error screen.

**Architecture:** Add a durable `coach_turn` table so turn progress survives outside any single HTTP connection; decouple SSE delivery from generation in `sseResponse` using `after()`; make the client poll turn status on mount/reconnect instead of relying on a live stream; and reduce how often large ad hoc requests ever need more time than the platform allows.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM / Postgres (Neon), Anthropic SDK, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-26-coach-resilience-design.md`

## Global Constraints

- `maxDuration` on coach routes: `300` (matches the existing convention in `/api/plans/upload/[id]/extract/route.ts` and the confirmed Vercel Hobby ceiling).
- Poll interval for turn-status reconnect: `2500`ms.
- Staleness threshold for a `"running"` row with no update: `6` minutes (`360_000`ms) — comfortably past the 300s ceiling.
- No live SSE re-streaming on reconnect — a finished reply popping in after a poll is sufficient (user-confirmed).
- Do not run `npm run db:migrate` against a live database as part of this work — generate the migration file only; applying it is a manual step for the project owner.
- Never run `git commit` or `git push` unless explicitly asked in that turn (standing instruction, applies to every task below).

## Review Focus

- **A second message sent while a reconnect-detected turn is still running** races the single `coach_turn` row and message ordering — covered by Task 7's input-disable-while-polling requirement.
- **`plan_id` is `null`** (the "no active plan" conversation) — the turn-status upsert/lookup must not silently create a duplicate row per turn instead of updating one; covered by Task 2's partial-unique-index-aware upsert tests.
- **The generator throws partway through instead of yielding a clean `error` event** (e.g. a bug elsewhere, not the documented `runCoach` error path) — `sseResponse` must still mark the turn `"error"` rather than leaving it stuck `"running"` forever; covered by Task 3.
- **A turn that finished (`"done"`/`"error"`) long ago** must not cause a stale alert/reconnect UI on an ordinary page load that never saw it running — covered by Task 7's "only surface terminal states observed after a `running` sighting" rule.
- **Cold-start build interrupted before any plan exists in the URL** (the builder-check's main finding) — switching screens or closing the app before `plan_id` ever reaches the URL must still lead back to the right conversation; covered by Task 8's two recovery paths.

---

## Task 1: `coach_turn` schema + migration

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `drizzle/0010_coach_turns.sql` (generated, not hand-written)

**Interfaces:**
- Produces: `coachTurnStatusEnum` (pgEnum: `"running" | "done" | "error"`), `coachTurns` pgTable with columns `id`, `user_id`, `plan_id` (nullable), `status`, `error_message`, `started_at`, `updated_at`. Later tasks import `coachTurns` from `@/server/db/schema`.

- [ ] **Step 1: Add the enum and table to `src/server/db/schema.ts`**

Add near the other enums/tables (after `messages`/before `planFiles` is a reasonable spot, matching how `messages` already sits next to `plans`):

```ts
export const coachTurnStatusEnum = pgEnum("coach_turn_status", ["running", "done", "error"]);

export const coachTurns = pgTable(
  "coach_turn",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan_id: uuid("plan_id").references(() => plans.id, { onDelete: "cascade" }),
    status: coachTurnStatusEnum("status").notNull().default("running"),
    error_message: text("error_message"),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A plain uniqueIndex on (user_id, plan_id) wouldn't dedupe NULL plan_id rows —
    // Postgres treats NULLs as distinct in unique indexes. Split into two partial
    // indexes, same pattern as `plan_one_active_per_user_idx` above.
    uniqueIndex("coach_turn_user_plan_idx")
      .on(t.user_id, t.plan_id)
      .where(sql`${t.plan_id} is not null`),
    uniqueIndex("coach_turn_user_null_plan_idx")
      .on(t.user_id)
      .where(sql`${t.plan_id} is null`),
  ]
);
```

All imports used here (`pgEnum`, `pgTable`, `uuid`, `text`, `timestamp`, `uniqueIndex`, `sql`) are already imported at the top of `schema.ts` (used by `plans`/`messages` already).

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate -- --name coach_turns`
Expected: a new file `drizzle/0010_coach_turns.sql` containing `CREATE TYPE "public"."coach_turn_status"`, `CREATE TABLE "coach_turn"`, and the two partial `CREATE UNIQUE INDEX ... WHERE ...` statements — and no other table's SQL (confirms the schema diff didn't pick up unrelated drift).

- [ ] **Step 3: Verify the project still typechecks and lints**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts drizzle/0010_coach_turns.sql drizzle/meta
git commit -m "feat: add coach_turn table for durable turn-status tracking"
```

**Note for the project owner:** this migration is generated but not applied. Run `npm run db:migrate` against your actual database when ready — not done here since no live `DATABASE_URL` is available in this environment and applying schema changes to a real database is a deliberately manual step.

---

## Task 2: `turn-status.ts` — durable upsert/read module

**Files:**
- Create: `src/server/coach/turn-status.ts`
- Test: `src/server/coach/__tests__/turn-status.test.ts`

**Interfaces:**
- Consumes: `coachTurns` from `@/server/db/schema` (Task 1), `db` from `@/server/db`.
- Produces: `CoachTurnStatus = "running" | "done" | "error"`; `CoachTurn = { status: CoachTurnStatus; error_message: string | null; started_at: Date }`; `upsertTurnStatus(userId: string, planId: string | null, status: CoachTurnStatus, errorMessage?: string | null): Promise<void>`; `getTurnStatus(userId: string, planId: string | null): Promise<CoachTurn | null>`. Task 3 and Task 4 both call these by exact name.

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/coach/__tests__/turn-status.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertChain = { values: vi.fn(), onConflictDoUpdate: vi.fn() };
const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(() => insertChain),
    select: vi.fn(() => selectChain),
  },
}));

vi.mock("@/server/db/schema", () => ({
  coachTurns: {
    user_id: "user_id",
    plan_id: "plan_id",
    status: "status",
    error_message: "error_message",
    started_at: "started_at",
    updated_at: "updated_at",
  },
}));

import { upsertTurnStatus, getTurnStatus } from "../turn-status";

beforeEach(() => {
  insertChain.values.mockReturnValue(insertChain);
  insertChain.onConflictDoUpdate.mockReset().mockResolvedValue(undefined);
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);
  selectChain.limit.mockReset();
});

describe("upsertTurnStatus", () => {
  it("targets the (user_id, plan_id) partial index when planId is set", async () => {
    await upsertTurnStatus("u1", "p1", "running");
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", plan_id: "p1", status: "running" })
    );
    const call = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(call.target).toEqual(["user_id", "plan_id"]);
    expect(call.set).toEqual(
      expect.objectContaining({ status: "running", error_message: null })
    );
  });

  it("targets the (user_id)-only partial index when planId is null", async () => {
    await upsertTurnStatus("u1", null, "running");
    const call = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(call.target).toEqual(["user_id"]);
  });

  it("does not reset started_at when transitioning to done", async () => {
    await upsertTurnStatus("u1", "p1", "done");
    const call = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(call.set.status).toBe("done");
    expect(call.set.started_at).toBeUndefined();
  });

  it("stores the error message when transitioning to error", async () => {
    await upsertTurnStatus("u1", "p1", "error", "boom");
    const call = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(call.set.error_message).toBe("boom");
  });
});

describe("getTurnStatus", () => {
  it("returns null when no row exists", async () => {
    selectChain.limit.mockResolvedValue([]);
    expect(await getTurnStatus("u1", "p1")).toBeNull();
  });

  it("returns the row when one exists", async () => {
    const row = { status: "running", error_message: null, started_at: new Date("2026-01-01") };
    selectChain.limit.mockResolvedValue([row]);
    expect(await getTurnStatus("u1", null)).toEqual(row);
  });
});
```

Note: the `target` arrays above are plain strings because the schema mock maps each column name to its own string (`user_id: "user_id"`, etc.) — this mirrors the exact mocking style already used in `src/server/coach/__tests__/runner.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/coach/__tests__/turn-status.test.ts`
Expected: FAIL — `../turn-status` does not exist yet.

- [ ] **Step 3: Implement `src/server/coach/turn-status.ts`**

```ts
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { coachTurns } from "@/server/db/schema";

export type CoachTurnStatus = "running" | "done" | "error";

export type CoachTurn = {
  status: CoachTurnStatus;
  error_message: string | null;
  started_at: Date;
};

function planFilter(userId: string, planId: string | null) {
  return planId
    ? and(eq(coachTurns.user_id, userId), eq(coachTurns.plan_id, planId))
    : and(eq(coachTurns.user_id, userId), isNull(coachTurns.plan_id));
}

export async function upsertTurnStatus(
  userId: string,
  planId: string | null,
  status: CoachTurnStatus,
  errorMessage: string | null = null
): Promise<void> {
  const now = new Date();
  const set =
    status === "running"
      ? { status, error_message: errorMessage, started_at: now, updated_at: now }
      : { status, error_message: errorMessage, updated_at: now };

  if (planId) {
    await db
      .insert(coachTurns)
      .values({ user_id: userId, plan_id: planId, status, error_message: errorMessage, started_at: now, updated_at: now })
      .onConflictDoUpdate({
        target: [coachTurns.user_id, coachTurns.plan_id],
        targetWhere: sql`${coachTurns.plan_id} is not null`,
        set,
      });
  } else {
    await db
      .insert(coachTurns)
      .values({ user_id: userId, plan_id: null, status, error_message: errorMessage, started_at: now, updated_at: now })
      .onConflictDoUpdate({
        target: [coachTurns.user_id],
        targetWhere: sql`${coachTurns.plan_id} is null`,
        set,
      });
  }
}

export async function getTurnStatus(userId: string, planId: string | null): Promise<CoachTurn | null> {
  const rows = await db
    .select({
      status: coachTurns.status,
      error_message: coachTurns.error_message,
      started_at: coachTurns.started_at,
    })
    .from(coachTurns)
    .where(planFilter(userId, planId))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/coach/__tests__/turn-status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/coach/turn-status.ts src/server/coach/__tests__/turn-status.test.ts
git commit -m "feat: add durable coach turn-status upsert/read"
```

---

## Task 3: `sse.ts` — decouple generation from the connection

**Files:**
- Modify: `src/lib/sse.ts`
- Test: `src/lib/__tests__/sse.test.ts` (new)

**Interfaces:**
- Consumes: `upsertTurnStatus` from `@/server/coach/turn-status` (Task 2); `after` from `next/server`.
- Produces: `export class CoachStreamError extends Error {}`; `export type TurnTracking = { userId: string; planId: string | null }`; `sseResponse(gen: AsyncIterable<SSEEvent>, turnTracking?: TurnTracking): Response` (signature change — second param is new and optional, so existing callers without it keep compiling). `consumeStream` unchanged. Task 5 passes `turnTracking`; Task 7 imports `CoachStreamError`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/sse.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SSEEvent } from "@/types/coach";

let capturedTask: Promise<unknown> | (() => unknown) | undefined;
vi.mock("next/server", () => ({
  after: (task: Promise<unknown> | (() => unknown)) => {
    capturedTask = task;
  },
}));

const mockUpsertTurnStatus = vi.fn();
vi.mock("@/server/coach/turn-status", () => ({
  upsertTurnStatus: (...args: unknown[]) => mockUpsertTurnStatus(...args),
}));

import { sseResponse } from "../sse";

async function* gen(events: SSEEvent[]): AsyncGenerator<SSEEvent> {
  for (const e of events) yield e;
}

async function readAll(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value);
  }
  return out;
}

beforeEach(() => {
  capturedTask = undefined;
  mockUpsertTurnStatus.mockReset().mockResolvedValue(undefined);
});

describe("sseResponse", () => {
  it("streams encoded SSE events to a connected client", async () => {
    const res = sseResponse(gen([{ type: "text-delta", delta: "hi" }, { type: "done", message_id: "m1" }]));
    const text = await readAll(res);
    expect(text).toContain("event: text-delta");
    expect(text).toContain('"delta":"hi"');
    expect(text).toContain("event: done");
  });

  it("marks the turn running then done when turnTracking is provided", async () => {
    const res = sseResponse(gen([{ type: "done", message_id: "m1" }]), { userId: "u1", planId: "p1" });
    await readAll(res);
    await capturedTask;
    expect(mockUpsertTurnStatus.mock.calls[0]).toEqual(["u1", "p1", "running", null]);
    expect(mockUpsertTurnStatus.mock.calls[1]).toEqual(["u1", "p1", "done", null]);
  });

  it("marks the turn as error when the generator yields an error event", async () => {
    const res = sseResponse(gen([{ type: "error", error: "boom" }]), { userId: "u1", planId: null });
    await readAll(res);
    await capturedTask;
    expect(mockUpsertTurnStatus).toHaveBeenCalledWith("u1", null, "error", "boom");
  });

  it("marks the turn as error if the generator ends without a done or error event", async () => {
    const res = sseResponse(gen([{ type: "text-delta", delta: "hi" }]), { userId: "u1", planId: "p1" });
    await readAll(res);
    await capturedTask;
    expect(mockUpsertTurnStatus).toHaveBeenLastCalledWith(
      "u1",
      "p1",
      "error",
      "Stream ended without completing"
    );
  });

  it("marks the turn as error when the generator throws instead of yielding an error event", async () => {
    // eslint-disable-next-line require-yield
    async function* throwingGen(): AsyncGenerator<SSEEvent> {
      throw new Error("unexpected failure");
    }
    const res = sseResponse(throwingGen(), { userId: "u1", planId: "p1" });
    await readAll(res);
    await capturedTask;
    expect(mockUpsertTurnStatus).toHaveBeenLastCalledWith("u1", "p1", "error", "unexpected failure");
  });

  it("keeps draining the generator to completion after the client cancels", async () => {
    let yielded = 0;
    async function* slowGen(): AsyncGenerator<SSEEvent> {
      yielded++;
      yield { type: "text-delta", delta: "a" };
      yielded++;
      yield { type: "done", message_id: "m1" };
    }
    const res = sseResponse(slowGen(), { userId: "u1", planId: "p1" });
    await res.body!.cancel();
    await capturedTask;
    expect(yielded).toBe(2);
    expect(mockUpsertTurnStatus).toHaveBeenCalledWith("u1", "p1", "done", null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/sse.test.ts`
Expected: FAIL (current `sseResponse` takes one argument and has none of this behavior).

- [ ] **Step 3: Rewrite `src/lib/sse.ts`**

```ts
import { after } from "next/server";
import type { SSEEvent } from "@/types/coach";
import { upsertTurnStatus } from "@/server/coach/turn-status";

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

/** Thrown by the client when the server sent an explicit `error` SSE event —
 * distinguishes "the coach reported a specific failure" from a connection
 * just dying mid-stream (see CoachPageClient). */
export class CoachStreamError extends Error {}

export function sseEvent(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export type TurnTracking = { userId: string; planId: string | null };

export function sseResponse(gen: AsyncIterable<SSEEvent>, turnTracking?: TurnTracking): Response {
  const enc = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let clientGone = false;

  const drained = (async () => {
    let settled = false;
    try {
      if (turnTracking) {
        await upsertTurnStatus(turnTracking.userId, turnTracking.planId, "running", null);
      }
      for await (const event of gen) {
        if (!clientGone) {
          try {
            controller!.enqueue(enc.encode(sseEvent(event)));
          } catch {
            clientGone = true;
          }
        }
        if (turnTracking && event.type === "done") {
          settled = true;
          await upsertTurnStatus(turnTracking.userId, turnTracking.planId, "done", null);
        } else if (turnTracking && event.type === "error") {
          settled = true;
          await upsertTurnStatus(turnTracking.userId, turnTracking.planId, "error", event.error);
        }
      }
      if (turnTracking && !settled) {
        await upsertTurnStatus(
          turnTracking.userId,
          turnTracking.planId,
          "error",
          "Stream ended without completing"
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      if (!clientGone) {
        try {
          controller!.enqueue(enc.encode(sseEvent({ type: "error", error: msg })));
        } catch {
          clientGone = true;
        }
      }
      if (turnTracking) {
        await upsertTurnStatus(turnTracking.userId, turnTracking.planId, "error", msg);
      }
    } finally {
      if (!clientGone) {
        try {
          controller!.close();
        } catch {
          /* already closed */
        }
      }
    }
  })();

  // Keeps this invocation alive (up to the route's maxDuration) until `drained`
  // settles, even if the client disconnects before then — see spec §4.3.
  after(drained);

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      clientGone = true;
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

export async function consumeStream(res: Response, onEvent: (ev: SSEEvent) => void): Promise<void> {
  if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice(6)) as SSEEvent);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/sse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sse.ts src/lib/__tests__/sse.test.ts
git commit -m "feat: decouple coach turn generation from the SSE connection"
```

---

## Task 4: `GET /api/coach/turn-status`

**Files:**
- Create: `src/app/api/coach/turn-status/route.ts`
- Test: `src/app/api/coach/turn-status/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getTurnStatus` from `@/server/coach/turn-status` (Task 2), `auth` from `@/server/auth`.
- Produces: `GET` handler returning `{ turn: CoachTurn | null }` as JSON, `401` when unauthenticated. Task 7's client fetches this exact path and shape.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/coach/turn-status/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => mockAuth() }));

const mockGetTurnStatus = vi.fn();
vi.mock("@/server/coach/turn-status", () => ({
  getTurnStatus: (...args: unknown[]) => mockGetTurnStatus(...args),
}));

import { GET } from "../route";
import { NextRequest } from "next/server";

function makeReq(planId?: string) {
  const url = planId
    ? `http://localhost/api/coach/turn-status?plan_id=${planId}`
    : "http://localhost/api/coach/turn-status";
  return new NextRequest(url);
}

describe("GET /api/coach/turn-status", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetTurnStatus.mockReset();
  });

  it("returns 401 if not authed", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns { turn: null } when no turn exists (no plan_id → null scope)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetTurnStatus.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ turn: null });
    expect(mockGetTurnStatus).toHaveBeenCalledWith("u1", null);
  });

  it("passes plan_id through and returns the turn row", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetTurnStatus.mockResolvedValue({
      status: "running",
      error_message: null,
      started_at: new Date("2026-01-01"),
    });
    const res = await GET(makeReq("plan-abc"));
    expect(mockGetTurnStatus).toHaveBeenCalledWith("u1", "plan-abc");
    const body = await res.json();
    expect(body.turn.status).toBe("running");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/coach/turn-status/__tests__/route.test.ts`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Implement `src/app/api/coach/turn-status/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getTurnStatus } from "@/server/coach/turn-status";

function parsePlanId(req: NextRequest): string | null {
  const v = req.nextUrl.searchParams.get("plan_id");
  return v && v !== "null" ? v : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const turn = await getTurnStatus(session.user.id, parsePlanId(req));
  return NextResponse.json({ turn });
}
```

This mirrors `src/app/api/coach/messages/route.ts`'s auth/scoping pattern exactly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/coach/turn-status/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/coach/turn-status
git commit -m "feat: add GET /api/coach/turn-status"
```

---

## Task 5: Wire `maxDuration` and turn tracking into the chat/build routes

**Files:**
- Modify: `src/app/api/coach/chat/route.ts`
- Modify: `src/app/api/coach/build/route.ts`
- Modify: `src/app/api/coach/chat/__tests__/route.test.ts`
- Modify: `src/app/api/coach/build/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `sseResponse(gen, turnTracking?)` from Task 3.
- Produces: nothing new consumed by later tasks — this is the route-level wiring task.

- [ ] **Step 1: Add `maxDuration` and pass `turnTracking` in `src/app/api/coach/chat/route.ts`**

Add near the top of the file: `export const maxDuration = 300;`

Change the body so `planId` is a named local (currently inlined in the `runCoach({...})` call) and reused for `sseResponse`:

```ts
const planId: string | null = body.plan_id ?? null;
// ...
return sseResponse(
  runCoach({
    userId: session.user.id!,
    message: body.message,
    planId,
    fromRoute: body.from_route,
    fromLabel: typeof body.from_label === "string" ? body.from_label.slice(0, 200) : undefined,
    planFileId: body.plan_file_id,
    today,
  }),
  { userId: session.user.id!, planId }
);
```

- [ ] **Step 2: Add `maxDuration` and pass `turnTracking` in `src/app/api/coach/build/route.ts`**

Add `export const maxDuration = 300;` near the top. Change the final `return sseResponse(...)` to pass the turn-tracking second argument, keyed on the stub plan id that's already a local variable:

```ts
return sseResponse(
  prependPlanCreated(
    stub.id,
    runCoach({
      userId: session.user.id!,
      message,
      today,
      planId: stub.id,
      stravaPreload: preload,
      coldStartBuild: true,
    })
  ),
  { userId: session.user.id!, planId: stub.id }
);
```

- [ ] **Step 3: Update both route test files so they mock `next/server`'s `after` and `@/server/coach/turn-status`**

`sseResponse` now transitively imports `next/server`'s `after` (which throws outside a request scope — exactly the vitest environment) and `@/server/coach/turn-status` (which imports the real `@/server/db`). Both existing route test files exercise the real `sseResponse`, so add to the top of **both** `src/app/api/coach/chat/__tests__/route.test.ts` and `src/app/api/coach/build/__tests__/route.test.ts`:

```ts
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});
vi.mock("@/server/coach/turn-status", () => ({
  upsertTurnStatus: vi.fn().mockResolvedValue(undefined),
}));
```

No assertions on these mocks are needed in these two files — turn-status behavior is already covered by Task 3's `sse.test.ts`. This step only keeps the existing tests passing.

- [ ] **Step 4: Run both test files to verify they still pass**

Run: `npx vitest run src/app/api/coach/chat/__tests__/route.test.ts src/app/api/coach/build/__tests__/route.test.ts`
Expected: PASS (same assertions as before — this step proves the wiring didn't change observable route behavior for the existing cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/coach/chat/route.ts src/app/api/coach/build/route.ts src/app/api/coach/chat/__tests__/route.test.ts src/app/api/coach/build/__tests__/route.test.ts
git commit -m "feat: set explicit maxDuration and track turn status on coach routes"
```

---

## Task 6: System prompt — batch large ad hoc requests

**Files:**
- Modify: `src/server/coach/system-prompt.ts`

**Interfaces:** none — prose-only change, no other task depends on its exact wording.

- [ ] **Step 1: Add a new section to `COACH_SYSTEM_PROMPT`**

Insert a new section after "# Building a new plan (cold start)" (around line 121-122, right before "# Training load"), covering the ad hoc path where `create_plan` is called directly from a normal chat turn rather than through the structured build form (no `Cold-start plan build: true` in context):

```
# Large ad hoc requests (outside the structured build flow)
A single turn has a hard time limit. If asked to create a plan or write out more than roughly two weeks of workouts in one message, without a `Cold-start plan build: true` context flag, don't try to do it all in one turn.

Write one or two weeks, call `update_workouts`, say briefly what you wrote and that you're continuing, then keep going on the athlete's next message (or immediately if they said "keep going" / "continue"). Your own `create_plan` tool result in the conversation history has the plan id — reuse it on later turns rather than asking the athlete to repeat it. Call `finalize_plan` once every week is written, the same as the structured build flow.
```

- [ ] **Step 2: Verify lint/typecheck still pass**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors (this file has no dedicated test today — a template-literal addition can't break typing, but this step confirms the file still parses correctly).

- [ ] **Step 3: Commit**

```bash
git add src/server/coach/system-prompt.ts
git commit -m "feat: have the coach batch large ad hoc plan requests across turns"
```

---

## Task 7: Client — accurate errors + reconnect/poll for an in-progress turn

**Files:**
- Modify: `src/app/(app)/coach/coach-page-client.tsx`

**Interfaces:**
- Consumes: `CoachStreamError` from `@/lib/sse` (Task 3); `GET /api/coach/turn-status` (Task 4) returning `{ turn: { status: "running" | "done" | "error"; error_message: string | null; started_at: string } | null }`.
- Produces: exports `COACH_BUILD_STASH_KEY` (a new named export, a plain string constant) that Task 8 imports.

No automated test for this file — there is no existing test harness for `CoachPageClient` (it's a complex streaming client component with no `__tests__` entry today, unlike `message-bubble.tsx`/`build-form-card.tsx`), and standing up jsdom+ReadableStream mocking for it here would be disproportionate net-new test infrastructure for this change. Verify via Step 4's manual check instead.

- [ ] **Step 1: Add the `CoachStreamError`-aware error message**

Import `CoachStreamError` alongside the existing `consumeStream` import:

```ts
import { consumeStream, CoachStreamError } from "@/lib/sse";
```

In `handleSSE`, change the `error` branch to throw the typed error instead of a plain one:

```ts
} else if (ev.type === "error") {
  throw new CoachStreamError(ev.error);
}
```

In both `send`'s and `buildSubmit`'s `catch (err)` blocks, replace the hardcoded `alert("Coach error — please try again.")` with:

```ts
console.error(err);
alert(
  err instanceof CoachStreamError
    ? err.message
    : "That request took too long and didn't finish — try asking for a smaller piece at a time."
);
```

- [ ] **Step 2: Add turn-status polling on mount/reconnect**

Add near the other top-level constants in the file:

```ts
export const COACH_BUILD_STASH_KEY = "coachInProgressBuildPlanId";
const TURN_POLL_INTERVAL_MS = 2500;
const TURN_STALE_MS = 6 * 60 * 1000;

type TurnStatusResponse = {
  turn: { status: "running" | "done" | "error"; error_message: string | null; started_at: string } | null;
};
```

Add a new state flag next to `sending`:

```ts
const [turnInFlight, setTurnInFlight] = useState(false);
```

Add a new effect, placed after the existing `sessionStorage.getItem("justBuiltPlanId")` effect:

```ts
useEffect(() => {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observedRunning = { current: false };

  async function poll() {
    const qs = planId ? `?plan_id=${encodeURIComponent(planId)}` : "";
    const r = await fetch(`/api/coach/turn-status${qs}`);
    if (cancelled || !r.ok) return;
    const { turn } = (await r.json()) as TurnStatusResponse;
    if (cancelled) return;

    const stale =
      turn?.status === "running" &&
      Date.now() - new Date(turn.started_at).getTime() > TURN_STALE_MS;

    if (turn?.status === "running" && !stale) {
      observedRunning.current = true;
      setTurnInFlight(true);
      timer = setTimeout(poll, TURN_POLL_INTERVAL_MS);
      return;
    }

    setTurnInFlight(false);
    if (!observedRunning.current) return; // nothing was in flight this mount — ordinary load

    if (turn?.status === "done") {
      void reloadHistory();
    } else if (turn?.status === "error" || stale) {
      alert(turn?.error_message ?? "That request took too long and didn't finish — try asking for a smaller piece at a time.");
    }
  }

  void poll();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}, [planId]);
```

- [ ] **Step 3: Disable input and show the thinking indicator while a reconnect-detected turn is running**

Change the `MessageInput` `disabled` prop:

```tsx
disabled={sending || turnInFlight || buildState?.kind === "editable" || buildState?.kind === "submitting"}
```

Add a sibling indicator right after the existing `{streaming && (...)}` block so a reconnect (no local `streaming` state) still shows something is happening:

```tsx
{!streaming && turnInFlight && <ThinkingIndicator />}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, then in the browser:
1. Send an ordinary coach message, let it finish normally — confirm no change in behavior (no stray alert, no stuck indicator).
2. Send a message, then reload the page immediately while it's still streaming — confirm the thinking indicator appears on reload and the reply appears once the turn finishes server-side (check the terminal/server logs show the turn completing), without needing another manual reload.
3. Confirm the input is disabled while that reconnect indicator is showing (try typing/sending — it should be blocked), and re-enables once the reply lands.
4. Open the coach screen on an ordinary day with no turn in flight (fresh load, nothing pending) — confirm no alert ever fires, even if a past turn in this conversation's history previously ended in `"error"`.

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/coach/coach-page-client.tsx"
git commit -m "feat: show accurate errors and reconnect to an in-progress coach turn"
```

---

## Task 8: Cold-start build reconnect (sessionStorage stash + Plans-list link)

**Files:**
- Modify: `src/app/(app)/coach/coach-page-client.tsx`
- Modify: `src/app/(app)/coach/coach-content.tsx`
- Modify: `src/components/plans/plan-card.tsx`
- Test: `src/components/plans/__tests__/plan-card.test.tsx` (new)

**Interfaces:**
- Consumes: `COACH_BUILD_STASH_KEY` (Task 7) in `coach-content.tsx`.

- [ ] **Step 1: Stash the in-progress build's plan id as soon as it's known**

In `coach-page-client.tsx`'s `handleSSE`, in the existing `plan-created` branch, add the stash write right after the existing ref/state updates:

```ts
if (ev.type === "plan-created") {
  receivedPlanIdRef.current = ev.plan_id;
  setPlanId(ev.plan_id);
  try {
    sessionStorage.setItem(COACH_BUILD_STASH_KEY, ev.plan_id);
  } catch {
    /* sessionStorage unavailable — reconnect just won't work for this session */
  }
  return;
}
```

In `buildSubmit`'s existing `finally` block, clear the stash once the turn has ended (success or failure — either way the stash has served its purpose, since on success the URL now carries `plan_id` and on failure there's nothing to reconnect to):

```ts
} finally {
  setSending(false);
  try {
    sessionStorage.removeItem(COACH_BUILD_STASH_KEY);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 2: Redirect on mount when a stashed build is found**

In `coach-content.tsx`, import `useRouter` alongside the existing `useSearchParams` import, and `COACH_BUILD_STASH_KEY` from `./coach-page-client`. Add this effect inside `CoachContent`, before the `if (intent === "build" && !planId)` early return (hooks must run unconditionally, so it goes alongside the existing `useMemo` for `planId`):

```ts
const router = useRouter();

useEffect(() => {
  if (intent !== "build" || planId) return;
  let stashed: string | null = null;
  try {
    stashed = sessionStorage.getItem(COACH_BUILD_STASH_KEY);
  } catch {
    /* ignore */
  }
  if (stashed) router.replace(`/coach?plan_id=${encodeURIComponent(stashed)}`);
}, [intent, planId, router]);
```

(`useEffect` needs importing from `"react"` alongside the existing `useMemo`.)

- [ ] **Step 3: Write the failing test for the plan-card link change**

```tsx
// src/components/plans/__tests__/plan-card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanCard } from "../plan-card";
import type { PlanWithCounts } from "@/types/plans";

function makePlan(overrides: Partial<PlanWithCounts> = {}): PlanWithCounts {
  return {
    id: "plan-1",
    userId: "u1",
    title: "Marathon Block",
    sport: "run",
    mode: "goal",
    goal: null,
    start_date: "2026-01-01",
    end_date: "2026-04-01",
    is_active: false,
    source: "coach_generated",
    source_file_id: null,
    coach_notes: "",
    generation_status: "complete",
    created_at: new Date(),
    updated_at: new Date(),
    max_weekly_meters: 0,
    longest_run_meters: 0,
    ...overrides,
  };
}

describe("PlanCard", () => {
  it("links to the plan detail page when complete", () => {
    render(<PlanCard plan={makePlan()} today="2026-02-01" units="mi" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/plans/plan-1");
  });

  it("links into the coach conversation while still generating", () => {
    render(<PlanCard plan={makePlan({ generation_status: "generating" })} today="2026-02-01" units="mi" />);
    const href = screen.getByRole("link").getAttribute("href");
    expect(href).toContain("/coach?plan_id=plan-1");
    expect(href).toContain("from_label=Marathon%20Block");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/components/plans/__tests__/plan-card.test.tsx`
Expected: FAIL on the second case — the card currently always links to `/plans/plan-1`.

- [ ] **Step 5: Implement the conditional href in `plan-card.tsx`**

```tsx
const href =
  status === "generating"
    ? `/coach?plan_id=${encodeURIComponent(plan.id)}&from=${encodeURIComponent("/plans")}&from_label=${encodeURIComponent(plan.title)}`
    : `/plans/${plan.id}`;
```

Use `href` in place of the inline template literal currently passed to `<Link href={...}>`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/components/plans/__tests__/plan-card.test.tsx`
Expected: PASS

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, then: start a cold-start build, switch to another in-app screen before it finishes, confirm navigating back to `/coach?intent=build` redirects to the in-progress conversation rather than showing a blank form. Separately, visit `/plans` while a plan is `"generating"` and confirm clicking its card lands in that plan's coach conversation.

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/coach/coach-page-client.tsx" "src/app/(app)/coach/coach-content.tsx" src/components/plans/plan-card.tsx src/components/plans/__tests__/plan-card.test.tsx
git commit -m "feat: recover an interrupted cold-start build's conversation"
```

---

## Final verification

- [ ] Run the full suite: `npm test`
Expected: all tests pass, including every new/modified file above.
- [ ] Run `npm run lint && npx tsc --noEmit`
Expected: no errors.
- [ ] Run `npm run build`
Expected: production build succeeds (confirms the new route segment configs and schema types compile cleanly end-to-end).
