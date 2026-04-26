# Phase 4: Coach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Commit policy override:** the user drives all commits. Implementer subagents should NOT run `git commit`. Leave changes staged or unstaged at the end of each task and report what's ready.

**Goal:** Land the full coach experience — a streaming Anthropic chat endpoint with 12 tools (plan + activity reads/writes + coach-notes management), a single-rolling-chat persistence model with "Clear chat", a coach-notes editor in `/settings`, and a `/coach` full-page chat UI accessed via the existing `AskCoachButton` (which forwards a `?from=<route>` so the coach knows where the user opened it from).

**Architecture:**
- **Persistence:** new `messages` table with `role` enum and `content jsonb` (full Anthropic content-block array round-tripped exactly so `tool_use`/`tool_result`/`thinking` blocks stay valid across turns). One rolling chat per user (no `conversation_id`). `coach_notes` already exists on `users` (added in Phase 1) — the coach reads + writes it via tool.
- **Coach module** (`src/coach/`):
  - `anthropic.ts` — singleton SDK client
  - `systemPrompt.ts` — frozen system prompt + cache-breakpoint sentinel (no per-user content, no `Date.now()`)
  - `context.ts` — `buildContextPrefix({ userId, fromRoute, today })` — assembles the per-turn user-message context (date, units, active-plan summary, **current `coach_notes` body**, **`from` route label** so coach knows where the user clicked from)
  - `messages.ts` — `loadHistory(userId)`, `appendMessage(userId, role, content)`, `clearMessages(userId)`
  - `tools/` — one file per category (`plans.ts`, `activities.ts`, `notes.ts`), plus `index.ts` exporting the consolidated `TOOLS` (definitions for the SDK) + `HANDLERS` (`name → (input, ctx) => result`). Every handler takes `{ userId }` from session — Claude can never name another user.
  - `runner.ts` — wraps `client.beta.messages.toolRunner` (streaming) with our system prompt + tools + history; returns an async iterable yielding our normalized SSE event shapes
- **API**:
  - `POST /api/coach/chat` (SSE) — body `{ message, from_route? }`. Persists user msg, runs tool loop, streams `text-delta` / `tool-use` / `tool-result` / `done` events, persists final assistant content.
  - `GET /api/coach/messages` — returns the user's history (used by the coach page server component to hydrate).
  - `DELETE /api/coach/messages` — clears history (Clear chat button).
  - `GET /api/coach/notes` — returns `{ content }`.
  - `PUT /api/coach/notes` — replaces (`{ content }`, ≤ 4 KB).
- **UI** (`src/app/(app)/coach/` + `src/components/coach/`):
  - `/coach` server component — auth-guard, prefetch history + active plan summary for first paint, hand off to client.
  - `CoachPageClient` — chat UI, streaming via `EventSource`-like fetch with reader (we use a plain `fetch` + `ReadableStream` reader to send POST body, since `EventSource` is GET-only).
  - `MessageBubble`, `ToolIndicator`, `MessageInput`, `ContextPill`, `ClearChatDialog`.
  - `AskCoachButton` (already in `src/components/layout/`) — modify to set `href={`/coach?from=${pathname}`}`.
  - `/settings` — extend existing settings page with a `<CoachNotesEditor>` textarea + Save button.
- **Caching:** `cache_control: { type: "ephemeral" }` breakpoint at the end of the system prompt. Tools render before system prompt, so this single breakpoint caches `tools` + `system` together. Per-user context goes in the user message *after* the cache breakpoint, so cache stays warm across users (modulo per-user message history, which is naturally appended).

**Tech Stack:**
- `@anthropic-ai/sdk` (latest) — using `client.beta.messages.toolRunner({ stream: true })` for the tool loop
- Next.js 16 route handlers with `ReadableStream` for SSE
- `react-markdown` + `remark-gfm` for assistant message rendering
- `@radix-ui/react-dialog` (already installed) for Clear-chat confirm + Coach-notes save confirm
- Existing: NextAuth v5, Drizzle ORM, Neon HTTP driver (no transactions), SCSS Modules, Vitest

---

## File structure

**Create:**
- `src/coach/anthropic.ts`
- `src/coach/systemPrompt.ts`
- `src/coach/context.ts`
- `src/coach/messages.ts`
- `src/coach/runner.ts`
- `src/coach/types.ts`
- `src/coach/__tests__/context.test.ts`
- `src/coach/__tests__/messages.test.ts`
- `src/coach/__tests__/runner.test.ts`
- `src/coach/tools/index.ts`
- `src/coach/tools/plans.ts`
- `src/coach/tools/activities.ts`
- `src/coach/tools/notes.ts`
- `src/coach/tools/__tests__/plans.test.ts`
- `src/coach/tools/__tests__/activities.test.ts`
- `src/coach/tools/__tests__/notes.test.ts`
- `src/app/api/coach/chat/route.ts`
- `src/app/api/coach/chat/__tests__/route.test.ts`
- `src/app/api/coach/messages/route.ts`
- `src/app/api/coach/messages/__tests__/route.test.ts`
- `src/app/api/coach/notes/route.ts`
- `src/app/api/coach/notes/__tests__/route.test.ts`
- `src/app/(app)/coach/page.tsx`
- `src/app/(app)/coach/CoachPageClient.tsx`
- `src/app/(app)/coach/Coach.module.scss`
- `src/components/coach/MessageBubble.tsx` + `.module.scss`
- `src/components/coach/MessageInput.tsx` + `.module.scss`
- `src/components/coach/ToolIndicator.tsx` + `.module.scss`
- `src/components/coach/ContextPill.tsx` + `.module.scss`
- `src/components/coach/ClearChatDialog.tsx` + `.module.scss`
- `src/components/coach/CoachNotesEditor.tsx` + `.module.scss`
- `src/strava/queries.ts` — small read helpers used by activity tools (`listRecentActivities`, `getActivityWithLaps`, `getAthleteSummary`). Phase 2 has the upsert/sync side; this adds the read side.

**Modify:**
- `src/db/schema.ts` — add `messageRoleEnum`, `messages` table
- `src/db/__tests__/schema.test.ts` — extend
- `src/components/layout/AskCoachButton.tsx` — set `?from=` query param to current pathname
- `src/app/(app)/settings/SettingsForm.tsx` (or whatever the existing settings page is named) — append `<CoachNotesEditor>` section. **Read the existing file first to confirm the right insertion point.**
- `package.json` + `package-lock.json` — add `@anthropic-ai/sdk`, `react-markdown`, `remark-gfm`
- `.env.example` — document `ANTHROPIC_API_KEY`

**Generate:** `drizzle/0003_<name>.sql`

---

## External setup

- **`ANTHROPIC_API_KEY`** — user has one already. Add to `.env` (gitignored). Add the key name (without value) to `.env.example`.

---

## Task 1: Add dependencies + env scaffolding

**Files:**
- Modify: `package.json`, `package-lock.json` (auto-updated)
- Modify: `.env.example`

- [ ] **Step 1: Install Anthropic SDK + markdown libraries**

Run:
```bash
npm install @anthropic-ai/sdk react-markdown remark-gfm
```

Expected: `package-lock.json` updated. No peer-dep errors (we have `legacy-peer-deps=true` in `.npmrc`).

- [ ] **Step 2: Document the env var**

Append to `.env.example`:
```
# Anthropic API key for the coach chat endpoint
ANTHROPIC_API_KEY=
```

- [ ] **Step 3: Verify install**

Run: `npm test -- --run`
Expected: existing 84 tests still pass (no new code yet).

---

## Task 2: Schema — `messages` table + role enum

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/__tests__/schema.test.ts`
- Generate: `drizzle/0003_<name>.sql`

- [ ] **Step 1: Extend pg-core import** (no change needed if Phase 3 already imports `pgEnum`).

- [ ] **Step 2: Add the role enum** (after the `workoutTypeEnum`):

```ts
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
```

- [ ] **Step 3: Add the `messages` table** (after `workouts`):

```ts
export const messages = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    // Anthropic content-block array. Preserves text + tool_use + tool_result + thinking blocks.
    content: jsonb("content").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("message_user_created_idx").on(t.user_id, t.created_at),
  ],
);
```

- [ ] **Step 4: Generate migration**

Run: `npm run db:generate`
Expected: `drizzle/0003_<name>.sql` with:
- `CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');`
- `CREATE TABLE "message" (...)`
- `CREATE INDEX "message_user_created_idx" ON "message" ("user_id","created_at");`
- No DROPs against earlier columns.

- [ ] **Step 5: Schema test**

Append to `src/db/__tests__/schema.test.ts`:
```ts
import { messages, messageRoleEnum } from "@/db/schema";

describe("messages table", () => {
  it("declares the expected columns", () => {
    const cols = Object.keys(messages);
    for (const c of ["id", "user_id", "role", "content", "created_at"]) {
      expect(cols).toContain(c);
    }
  });
});

describe("messageRoleEnum", () => {
  it("declares user and assistant", () => {
    expect(messageRoleEnum.enumValues).toEqual(["user", "assistant"]);
  });
});
```

- [ ] **Step 6: Run schema tests**

Run: `npx vitest run src/db/__tests__/schema.test.ts`
Expected: PASS, including new assertions.

- [ ] **Step 7: Stage** (do NOT commit per user policy)

Leave changes in the working tree.

---

## Task 3: Coach types

**Files:** Create `src/coach/types.ts`

```ts
import type { Anthropic } from "@anthropic-ai/sdk";

export type Role = "user" | "assistant";

// Re-shaped subset of Anthropic message content blocks we care about.
export type ContentBlock = Anthropic.Messages.ContentBlockParam;

export type StoredMessage = {
  id: string;
  role: Role;
  content: ContentBlock[];
  created_at: Date;
};

export type ToolName =
  | "get_active_plan"
  | "list_plans"
  | "get_plan"
  | "create_plan"
  | "update_workouts"
  | "set_active_plan"
  | "archive_plan"
  | "get_recent_activities"
  | "get_activity_laps"
  | "update_activity_match"
  | "get_athlete_summary"
  | "update_coach_notes";

export type ToolHandler<I = unknown, O = unknown> = (
  input: I,
  ctx: { userId: string },
) => Promise<O>;

export type SSEEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-use"; name: ToolName; input: unknown }
  | { type: "tool-result"; name: ToolName; result_summary: string }
  | { type: "done"; message_id: string }
  | { type: "error"; error: string };

export type ChatRequestBody = {
  message: string;
  from_route?: string; // e.g. "/today", "/calendar", "/plans"
};
```

- [ ] **Step 1: Write the file**, then run `npx tsc --noEmit` (expect a missing-Anthropic export error if SDK shape differs — fix the import path if needed; common alternatives are `@anthropic-ai/sdk/resources/messages` or just `Anthropic.MessageParam` from default export).

- [ ] **Step 2: Stage.**

---

## Task 4: Anthropic client singleton

**Files:** Create `src/coach/anthropic.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const COACH_MODEL = "claude-opus-4-7";
```

- [ ] **Step 1: Write the file.**
- [ ] **Step 2: Stage.**

---

## Task 5: System prompt (frozen, cache-friendly)

**Files:** Create `src/coach/systemPrompt.ts`

```ts
// FROZEN — no Date.now(), no per-user content, no random IDs.
// Per-turn variables go in the user message (see context.ts), not here.
//
// Order matters for caching: tools render before system, so a single
// cache_control breakpoint at the END of this string caches tools + system.
export const COACH_SYSTEM_PROMPT = `You are an experienced running and cycling coach for an advanced amateur athlete using a personal training-plan tracker called Race Horse.

# Role
- You are the user's coach. You analyze, recommend, and tweak training plans grounded in their actual Strava data and stated goals.
- The user is technical and self-aware — they want the *why* of training decisions, not platitudes.
- Distinguish run vs. bike coaching principles where relevant. (Z2 means different things on each.)
- Defer to medical professionals on injury / illness questions; do not prescribe medication or specific medical interventions.

# Available data (via tools)
- **Plans + workouts**: Each plan has a sport (run/bike), a mode (goal with end_date / indefinite), and a set of dated workouts with type (easy/long/tempo/threshold/intervals/recovery/race/rest/cross), distance, duration, target intensity (pace/power/HR/RPE), and optional intervals.
- **Activities**: Strava activities with normalized fields (distance_meters, moving_time_seconds, avg_hr, avg_pace_seconds_per_km, avg_power_watts, elevation_gain_m) plus per-lap breakdowns.
- **Coach notes** (your durable memory — see below).
- **web_search** for product/gear/race research with citations.

# Tool surface
You have read + write tools. They are self-describing. Call them whenever you need real data — do not invent numbers.

When making large plan changes, **ask before doing**. When making small workout tweaks (e.g., "make Saturday's long run an hour shorter"), state your intent and call \`update_workouts\` directly.

# Coach notes discipline
The block labeled \`Coach notes\` in the per-turn context is your durable memory. The notes are short, factual, and current (≤ 4 KB).
- Update via \`update_coach_notes\` when a goal, injury, constraint, or strong preference changes. The full new content replaces the old.
- Don't duplicate transient chat content. If the user mentions they're in NYC for a week, that's chat; if they're moving to NYC permanently, that's notes.
- Don't exceed 4 KB. When the notes get long, edit them down — newest information wins.

# Output style
- Be specific. Use real numbers (paces, distances, dates) from tool results, not vague directions.
- Prefer one focused suggestion over five hedged ones.
- Markdown is rendered. Use bold for key paces / dates and bullet lists for workout structures.
- When you update the plan, end your reply with a one-line summary of what changed (so the user can verify).
`;
```

- [ ] **Step 1: Write the file.**
- [ ] **Step 2: Stage.**

---

## Task 6: Coach module — `loadHistory`, `appendMessage`, `clearMessages`

**Files:**
- Create `src/coach/messages.ts`
- Create `src/coach/__tests__/messages.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fromChain = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
};
const selectChain = { from: vi.fn(() => fromChain) };
const insertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};
const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };

vi.mock("@/db", () => ({
  db: {
    select: () => selectChain,
    insert: () => insertChain,
    delete: () => deleteChain,
  },
}));
vi.mock("@/db/schema", () => ({
  messages: { id: "id", user_id: "user_id", role: "role", content: "content", created_at: "created_at" },
}));

import { loadHistory, appendMessage, clearMessages } from "../messages";

describe("loadHistory", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.orderBy.mockClear().mockReturnThis();
  });
  it("returns rows ordered by created_at asc", async () => {
    fromChain.orderBy.mockResolvedValueOnce([{ id: "m1" }, { id: "m2" }]);
    const out = await loadHistory("u1");
    expect(out).toEqual([{ id: "m1" }, { id: "m2" }]);
    expect(fromChain.where).toHaveBeenCalled();
    expect(fromChain.orderBy).toHaveBeenCalled();
  });
});

describe("appendMessage", () => {
  beforeEach(() => {
    insertChain.values.mockClear().mockReturnThis();
    insertChain.returning.mockReset();
  });
  it("inserts and returns new row", async () => {
    insertChain.returning.mockResolvedValueOnce([{ id: "m-new" }]);
    const out = await appendMessage("u1", "user", [{ type: "text", text: "hi" }]);
    expect(out.id).toBe("m-new");
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", role: "user" }),
    );
  });
});

describe("clearMessages", () => {
  beforeEach(() => { deleteChain.where.mockClear().mockResolvedValue(undefined); });
  it("issues DELETE scoped to user", async () => {
    await clearMessages("u1");
    expect(deleteChain.where).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run, expect failure** (`Cannot find module '../messages'`).

- [ ] **Step 3: Implement**

```ts
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import type { ContentBlock, Role, StoredMessage } from "./types";

export async function loadHistory(userId: string): Promise<StoredMessage[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.user_id, userId))
    .orderBy(asc(messages.created_at)) as Promise<StoredMessage[]>;
}

export async function appendMessage(
  userId: string,
  role: Role,
  content: ContentBlock[],
): Promise<StoredMessage> {
  const result = await db
    .insert(messages)
    .values({ user_id: userId, role, content })
    .returning();
  if (!result[0]) throw new Error("appendMessage: no row returned");
  return result[0] as StoredMessage;
}

export async function clearMessages(userId: string): Promise<void> {
  await db.delete(messages).where(eq(messages.user_id, userId));
}
```

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Stage.**

---

## Task 7: Coach context prefix builder

**Files:**
- Create `src/coach/context.ts`
- Create `src/coach/__tests__/context.test.ts`

The context prefix is a small text block prepended to every user message. It carries:
- Today's date (so the coach knows when "tomorrow" is without an `<expectation>` block)
- User units (`mi` / `km`)
- Active plan summary (1-3 lines pulled from `listPlansWithCounts`)
- Current `coach_notes` body
- The route the user came from (e.g., "User opened coach from: Today view (Apr 26)")

A pure builder is easier to test; a thin wrapper does the DB reads.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { renderContextPrefix, routeLabel } from "../context";

describe("routeLabel", () => {
  it("maps known routes to friendly labels", () => {
    expect(routeLabel("/today")).toMatch(/Today/);
    expect(routeLabel("/calendar")).toMatch(/Calendar/);
    expect(routeLabel("/plans")).toMatch(/Plans/);
    expect(routeLabel("/settings")).toMatch(/Settings/);
  });
  it("returns null for unknown / missing routes", () => {
    expect(routeLabel(undefined)).toBeNull();
    expect(routeLabel("/coach")).toBeNull();
    expect(routeLabel("/some/random/path")).toBeNull();
  });
});

describe("renderContextPrefix", () => {
  it("includes date, units, active plan, notes, and from-route", () => {
    const out = renderContextPrefix({
      today: "2026-04-26",
      units: "mi",
      activePlan: { title: "Boston Build", weeks_left: 8, workout_count: 84, completed: 46 },
      coachNotes: "Goal: sub-3:05 Boston. No injuries.",
      fromLabel: "Today view",
    });
    expect(out).toContain("2026-04-26");
    expect(out).toContain("mi");
    expect(out).toContain("Boston Build");
    expect(out).toContain("Coach notes:");
    expect(out).toContain("Goal: sub-3:05 Boston");
    expect(out).toContain("Today view");
  });

  it("omits sections that are empty", () => {
    const out = renderContextPrefix({
      today: "2026-04-26",
      units: "km",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
    });
    expect(out).not.toContain("Active plan:");
    expect(out).not.toContain("Coach notes:");
    expect(out).not.toContain("opened coach from:");
  });
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

```ts
type ActivePlanSummary = {
  title: string;
  weeks_left: number | null;
  workout_count: number;
  completed: number;
};

const ROUTE_LABELS: Record<string, string> = {
  "/today": "Today view",
  "/calendar": "Calendar view",
  "/plans": "Plans / manage page",
  "/settings": "Settings page",
};

export function routeLabel(from: string | undefined | null): string | null {
  if (!from) return null;
  return ROUTE_LABELS[from] ?? null;
}

export function renderContextPrefix(params: {
  today: string;                       // YYYY-MM-DD
  units: "mi" | "km";
  activePlan: ActivePlanSummary | null;
  coachNotes: string;
  fromLabel: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`<context>`);
  lines.push(`Today: ${params.today}`);
  lines.push(`User units: ${params.units}`);
  if (params.activePlan) {
    const a = params.activePlan;
    const wks = a.weeks_left == null ? "indefinite" : `${a.weeks_left} weeks left`;
    lines.push(
      `Active plan: ${a.title} — ${wks}, ${a.completed} / ${a.workout_count} workouts done`,
    );
  }
  if (params.coachNotes.trim()) {
    lines.push(``);
    lines.push(`Coach notes:`);
    lines.push(params.coachNotes.trim());
  }
  if (params.fromLabel) {
    lines.push(``);
    lines.push(`User opened coach from: ${params.fromLabel}`);
  }
  lines.push(`</context>`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Stage.**

---

## Task 8: Strava read helpers (used by activity tools)

**Files:**
- Create `src/strava/queries.ts`
- Create `src/strava/__tests__/queries.test.ts`

The Phase 2 strava module owns sync (writes). Tools need reads:

```ts
export async function listRecentActivities(userId: string, days: number): Promise<ActivitySummary[]>
export async function getActivityWithLaps(userId: string, activityId: string): Promise<{ activity: Activity; laps: Lap[] } | null>
export async function getAthleteSummary(userId: string): Promise<{ four_week: VolumeRollup; twelve_week: VolumeRollup; fifty_two_week: VolumeRollup }>
```

`ActivitySummary` is a thin projection (id, start_date, type, distance_meters, moving_time_seconds, avg_hr, avg_pace_seconds_per_km, avg_power_watts).

`VolumeRollup` is `{ count, total_distance_meters, total_moving_time_seconds, by_type: Record<string, { count, distance_meters, moving_time_seconds }> }`.

- [ ] **Step 1: TDD — write tests with mocked db that assert each function shape and SQL surface (where clauses, order, limit). Match the patterns in `src/plans/__tests__/queries.test.ts`.**

- [ ] **Step 2: Implement.** Use `gte(activities.start_date, sql`now() - ${days}::int * interval '1 day'`)` for the cutoff in `listRecentActivities` (single-statement, neon-http-safe). Use a single `SELECT ... GROUP BY` for the rollup aggregations (3 separate window queries are fine — 4 weeks, 12 weeks, 52 weeks are independent).

- [ ] **Step 3: Run, pass, stage.**

> **Note:** Detailed test/impl bodies for this task follow the same pattern as `src/plans/queries.ts` in Phase 3. The implementer subagent will write them concretely; do not pre-bake the SQL here.

---

## Task 9: Coach tools — plan tools

**Files:**
- Create `src/coach/tools/plans.ts`
- Create `src/coach/tools/__tests__/plans.test.ts`

Each tool exports a `Tool` definition (name, description, input schema as JSON Schema) and a handler that takes typed input + `{ userId }` and returns the response Claude will see (`tool_result.content`).

Tools to implement:
- `get_active_plan` — returns `{ plan: Plan | null, workouts: Workout[] }`. Reads `plans` where `userId AND is_active`, then `workouts` where `plan_id = $`.
- `list_plans` — returns `{ plans: PlanSummary[] }`. Wraps `listPlansWithCounts`.
- `get_plan(plan_id)` — returns `{ plan, workouts }`.
- `create_plan` — input `{ title, sport, mode, goal?, start_date, end_date?, workouts[], set_active }`. Calls `createPlan` then bulk-inserts workouts; if `set_active`, calls `setActivePlan`. Returns the new plan id.
- `update_workouts({plan_id, operations})` — `operations` is an array of `{ op: "upsert", date, workout }` or `{ op: "delete", date }`. Atomic-ish (per-row, since neon-http has no transactions). Returns counts of upserts/deletes.
- `set_active_plan(plan_id)` — wraps `setActivePlan`.
- `archive_plan(plan_id)` — wraps `archivePlan`.

Each handler verifies ownership (e.g., re-reads plan + checks `userId` before mutating).

Tool definitions follow this shape:
```ts
import type { Anthropic } from "@anthropic-ai/sdk";
type Tool = Anthropic.Messages.Tool;

export const get_active_plan: Tool = {
  name: "get_active_plan",
  description: "Returns the user's currently active plan and its workouts as structured JSON. Returns null if no plan is active.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
};
```

The handlers map ties them to functions:
```ts
export const PLAN_HANDLERS: Record<string, ToolHandler<unknown, unknown>> = {
  get_active_plan: async (_input, { userId }) => { ... },
  ...
};
```

- [ ] **Step 1: TDD — write tests for each handler that mock `@/plans/queries` / `@/db` and assert the user-id is propagated and the right query is called.**

- [ ] **Step 2: Implement** as outlined above. Throw `new Error("plan not found or not owned")` for any operation on a plan whose ownership check fails.

- [ ] **Step 3: Stage.**

---

## Task 10: Coach tools — activity tools

**Files:**
- Create `src/coach/tools/activities.ts`
- Create `src/coach/tools/__tests__/activities.test.ts`

Tools:
- `get_recent_activities({ days })` — wraps `listRecentActivities`. Returns `{ activities, summary: { count, total_distance_meters, total_moving_time_seconds } }`.
- `get_activity_laps({ activity_id })` — wraps `getActivityWithLaps`. Returns `{ activity, laps }`.
- `update_activity_match({ activity_id, workout_id })` — sets `activities.matched_workout_id = workout_id` after verifying both belong to user. Phase 5 fully owns matching, but the *manual* re-match knob is a coach tool, so it lives in Phase 4.

  > **Note:** This requires `activities.matched_workout_id` column on `activities`. That column was specced in §6 but Phase 2 did not add it (it's used in Phase 5). **Add it as part of this task's migration.** Specifically: extend the migration in Task 2 (or generate a new one) with `ALTER TABLE "activity" ADD COLUMN "matched_workout_id" uuid REFERENCES "workout"("id") ON DELETE SET NULL;`. Update `src/db/schema.ts` accordingly.

- `get_athlete_summary` — wraps `getAthleteSummary` (4 / 12 / 52-week rollups).

- [ ] **Step 1: Add the `matched_workout_id` column** to `src/db/schema.ts` `activities` table:
```ts
matched_workout_id: uuid("matched_workout_id").references(() => workouts.id, { onDelete: "set null" }),
```
Re-run `npm run db:generate` — should produce `0004_*.sql` (or amend the Phase 4 migration depending on what's already generated). Verify it only emits the `ALTER TABLE` and no destructive ops.

- [ ] **Step 2: Schema test** — extend `src/db/__tests__/schema.test.ts` to assert `Object.keys(activities).includes("matched_workout_id")`.

- [ ] **Step 3: TDD activity tool handlers.**

- [ ] **Step 4: Stage.**

---

## Task 11: Coach tools — `update_coach_notes`

**Files:**
- Create `src/coach/tools/notes.ts`
- Create `src/coach/tools/__tests__/notes.test.ts`

A single tool that overwrites `users.coach_notes`. ≤ 4 KB cap.

```ts
export const update_coach_notes: Tool = {
  name: "update_coach_notes",
  description: "Overwrites the user's coach notes with the provided content. Use to keep durable memory tight and curated. Notes ≤ 4096 characters.",
  input_schema: {
    type: "object",
    properties: { content: { type: "string", maxLength: 4096 } },
    required: ["content"],
    additionalProperties: false,
  },
};

export const update_coach_notes_handler: ToolHandler<{ content: string }, { ok: true; bytes: number }> =
  async (input, { userId }) => {
    if (typeof input.content !== "string") throw new Error("content must be string");
    if (input.content.length > 4096) throw new Error("content exceeds 4096 chars");
    await db
      .update(users)
      .set({ coach_notes: input.content })
      .where(eq(users.id, userId));
    return { ok: true, bytes: input.content.length };
  };
```

- [ ] **Step 1: TDD test.**
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Stage.**

---

## Task 12: Tool registry

**Files:** Create `src/coach/tools/index.ts`

```ts
import type { Anthropic } from "@anthropic-ai/sdk";
import * as plans from "./plans";
import * as activities from "./activities";
import * as notes from "./notes";
import type { ToolHandler, ToolName } from "../types";

// Anthropic server-side tools — do NOT include in HANDLERS (Anthropic runs them)
const SERVER_TOOLS: Anthropic.Messages.Tool[] = [
  // Latest stable web search tool — bump the date as Anthropic ships new versions.
  { type: "web_search_20260209", name: "web_search" } as unknown as Anthropic.Messages.Tool,
];

export const TOOLS: Anthropic.Messages.Tool[] = [
  plans.get_active_plan,
  plans.list_plans,
  plans.get_plan,
  plans.create_plan,
  plans.update_workouts,
  plans.set_active_plan,
  plans.archive_plan,
  activities.get_recent_activities,
  activities.get_activity_laps,
  activities.update_activity_match,
  activities.get_athlete_summary,
  notes.update_coach_notes,
  ...SERVER_TOOLS,
];

export const HANDLERS: Record<ToolName, ToolHandler> = {
  get_active_plan: plans.get_active_plan_handler,
  list_plans: plans.list_plans_handler,
  get_plan: plans.get_plan_handler,
  create_plan: plans.create_plan_handler,
  update_workouts: plans.update_workouts_handler,
  set_active_plan: plans.set_active_plan_handler,
  archive_plan: plans.archive_plan_handler,
  get_recent_activities: activities.get_recent_activities_handler,
  get_activity_laps: activities.get_activity_laps_handler,
  update_activity_match: activities.update_activity_match_handler,
  get_athlete_summary: activities.get_athlete_summary_handler,
  update_coach_notes: notes.update_coach_notes_handler,
};

// Short human-readable summaries for tool-result events (shown in UI as "Updated 3 workouts")
export function summarizeToolResult(name: ToolName, result: unknown): string {
  switch (name) {
    case "get_active_plan": return "Read active plan";
    case "list_plans": return "Listed plans";
    case "get_plan": return "Read plan";
    case "create_plan": return "Created plan";
    case "update_workouts": {
      const r = result as { upserted?: number; deleted?: number };
      return `Updated workouts (${r.upserted ?? 0} upserted, ${r.deleted ?? 0} deleted)`;
    }
    case "set_active_plan": return "Activated plan";
    case "archive_plan": return "Archived plan";
    case "get_recent_activities": return "Read recent activities";
    case "get_activity_laps": return "Read activity laps";
    case "update_activity_match": return "Updated activity match";
    case "get_athlete_summary": return "Read athlete summary";
    case "update_coach_notes": return "Updated coach notes";
  }
}
```

- [ ] **Step 1: Write the file. **
- [ ] **Step 2: Run `npx tsc --noEmit`** to confirm no type errors. The `SERVER_TOOLS` cast is a known pain — if the SDK's `Tool` type doesn't accept `web_search_20260209` directly, cast through `unknown` (as shown). If a newer SDK release makes the type direct, drop the cast.
- [ ] **Step 3: Stage.**

---

## Task 13: Coach runner — wraps SDK toolRunner with our tools

**Files:**
- Create `src/coach/runner.ts`
- Create `src/coach/__tests__/runner.test.ts`

The runner:
1. Loads history.
2. Builds the next user message: `[ { type: "text", text: contextPrefix + "\n\n" + userMessage } ]`. Persists it.
3. Calls `client.beta.messages.toolRunner({ stream: true, model, system, tools, messages, ... })`.
4. Iterates the runner — for each item:
   - text delta → emit `{ type: "text-delta", delta }`
   - tool use → emit `{ type: "tool-use", name, input }`, run the handler, emit `{ type: "tool-result", name, result_summary }`
   - completion → emit `{ type: "done", message_id }` after persisting the final assistant content
5. On error, emit `{ type: "error", error }` and re-throw.

```ts
import { getAnthropic, COACH_MODEL } from "./anthropic";
import { COACH_SYSTEM_PROMPT } from "./systemPrompt";
import { renderContextPrefix, routeLabel } from "./context";
import { appendMessage, loadHistory } from "./messages";
import { HANDLERS, TOOLS, summarizeToolResult } from "./tools";
import { db } from "@/db";
import { users, plans } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { ContentBlock, SSEEvent, ToolName } from "./types";

interface RunInput {
  userId: string;
  message: string;
  fromRoute?: string;
  today: string; // YYYY-MM-DD, server-injected
}

async function loadContextPrefix(input: RunInput): Promise<string> {
  // single round-trip user + active plan + counts
  const u = await db.select({
    units: sql<"mi" | "km">`(${users.preferences}->>'units')`,
    coach_notes: users.coach_notes,
  }).from(users).where(eq(users.id, input.userId)).limit(1);

  // Active plan summary — null if no active plan
  const active = await db
    .select({
      title: plans.title,
      end_date: plans.end_date,
      workout_count: sql<number>`(SELECT COUNT(*)::int FROM workout WHERE plan_id = ${plans.id})`,
      completed: sql<number>`(SELECT COUNT(*)::int FROM workout WHERE plan_id = ${plans.id} AND date <= ${input.today}::date)`,
    })
    .from(plans)
    .where(and(eq(plans.userId, input.userId), eq(plans.is_active, true)))
    .limit(1);

  const a = active[0];
  return renderContextPrefix({
    today: input.today,
    units: u[0]?.units ?? "mi",
    coachNotes: u[0]?.coach_notes ?? "",
    fromLabel: routeLabel(input.fromRoute),
    activePlan: a
      ? {
          title: a.title,
          weeks_left: a.end_date
            ? Math.max(0, Math.ceil((new Date(a.end_date).getTime() - new Date(input.today).getTime()) / 86_400_000 / 7))
            : null,
          workout_count: a.workout_count,
          completed: a.completed,
        }
      : null,
  });
}

export async function* runCoach(input: RunInput): AsyncGenerator<SSEEvent> {
  const client = getAnthropic();
  const prefix = await loadContextPrefix(input);

  // Persist the user message exactly as Claude will see it (prefix + body).
  const userBlocks: ContentBlock[] = [{ type: "text", text: `${prefix}\n\n${input.message}` }];
  await appendMessage(input.userId, "user", userBlocks);

  // Reload full history so the new user message is included in the messages array we send.
  const history = await loadHistory(input.userId);
  const sdkMessages = history.map((m) => ({ role: m.role, content: m.content }));

  const runner = client.beta.messages.toolRunner({
    model: COACH_MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" } as never,    // SDK shape may vary; cast as needed
    system: [
      { type: "text", text: COACH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    tools: TOOLS,
    messages: sdkMessages,
    runner_handlers: {
      // Map our HANDLERS into the SDK's expected runner shape.
      // Real SDK API: each tool registers a handler; the runner calls it and feeds the
      // result back into the loop. The exact shape may differ — check
      // node_modules/@anthropic-ai/sdk/resources/beta/messages.d.ts at impl time.
    } as never,
  });

  let finalContent: ContentBlock[] = [];
  for await (const event of runner) {
    // Pseudo-code for event mapping — actual event shapes per the SDK's stream type.
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      yield { type: "text-delta", delta: event.delta.text };
    } else if (event.type === "tool_use") {
      yield { type: "tool-use", name: event.name as ToolName, input: event.input };
    } else if (event.type === "tool_result") {
      yield {
        type: "tool-result",
        name: event.name as ToolName,
        result_summary: summarizeToolResult(event.name as ToolName, event.result),
      };
    } else if (event.type === "message_complete") {
      finalContent = event.content as ContentBlock[];
    }
  }

  const persisted = await appendMessage(input.userId, "assistant", finalContent);
  yield { type: "done", message_id: persisted.id };
}
```

> **Implementer note:** the SDK's `beta.messages.toolRunner` API surface changes between minor versions. **Read `node_modules/@anthropic-ai/sdk/resources/beta/messages.d.ts` first** to confirm the exact event types and runner config. The shape above is illustrative; adapt to whatever the installed version exposes. The contract this code must produce is the `SSEEvent` stream defined in `src/coach/types.ts` — the rest is implementation detail.

- [ ] **Step 1: TDD test** that mocks `getAnthropic()` to return a fake whose `toolRunner` yields a hard-coded sequence (text-delta x N, then tool-use, then tool-result, then message-complete) and asserts the SSEEvents emitted in order, plus that `appendMessage` was called once for "user" and once for "assistant".

- [ ] **Step 2: Implement.** If the SDK API shape blocks progress, escalate as BLOCKED.

- [ ] **Step 3: Stage.**

---

## Task 14: API route — `POST /api/coach/chat` (SSE)

**Files:**
- Create `src/app/api/coach/chat/route.ts`
- Create `src/app/api/coach/chat/__tests__/route.test.ts`

```ts
import { auth } from "@/auth";
import { runCoach } from "@/coach/runner";
import type { ChatRequestBody, SSEEvent } from "@/coach/types";

function sse(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!body.message?.trim()) {
    return new Response(JSON.stringify({ error: "message required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const event of runCoach({
          userId: session.user.id!,
          message: body.message,
          fromRoute: body.from_route,
          today: isoToday(),
        })) {
          controller.enqueue(enc.encode(sse(event)));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(enc.encode(sse({ type: "error", error: msg })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no", // disable proxy buffering on platforms that honor it
    },
  });
}
```

- [ ] **Step 1: TDD route tests** that mock `runCoach` to yield a deterministic sequence, then read the response body and assert SSE wire format (`event: text-delta\ndata: {...}\n\n`).

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Stage.**

---

## Task 15: API route — `GET` + `DELETE /api/coach/messages`

**Files:**
- Create `src/app/api/coach/messages/route.ts`
- Create `src/app/api/coach/messages/__tests__/route.test.ts`

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { clearMessages, loadHistory } from "@/coach/messages";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const messages = await loadHistory(session.user.id);
  return NextResponse.json({ messages });
}

export async function DELETE(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearMessages(session.user.id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 1: TDD tests** (auth → 401 / 200, DELETE → 204).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Stage.**

---

## Task 16: API route — `GET` + `PUT /api/coach/notes`

**Files:**
- Create `src/app/api/coach/notes/route.ts`
- Create `src/app/api/coach/notes/__tests__/route.test.ts`

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db.select({ coach_notes: users.coach_notes })
    .from(users).where(eq(users.id, session.user.id)).limit(1);
  return NextResponse.json({ content: rows[0]?.coach_notes ?? "" });
}

export async function PUT(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { content?: string };
  try { body = (await req.json()) as { content?: string }; }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (typeof body.content !== "string") return NextResponse.json({ error: "content required" }, { status: 400 });
  if (body.content.length > 4096) return NextResponse.json({ error: "content exceeds 4096 chars" }, { status: 400 });
  await db.update(users).set({ coach_notes: body.content }).where(eq(users.id, session.user.id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 1: TDD tests covering the 401 / 400 / 200 paths.**
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Stage.**

---

## Task 17: `AskCoachButton` — propagate `?from=` query param

**Files:** Modify `src/components/layout/AskCoachButton.tsx`

Read the existing file. It's currently a static `<Link href="/coach">…</Link>` (or similar). Convert to a client component that reads `usePathname()` and renders:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AskCoachButton.module.scss";

export function AskCoachButton() {
  const pathname = usePathname();
  const href = pathname && pathname !== "/coach"
    ? `/coach?from=${encodeURIComponent(pathname)}`
    : "/coach";
  return (
    <Link href={href} className={styles.button} aria-label="Ask coach">
      ✦ Ask coach
    </Link>
  );
}
```

- [ ] **Step 1: Read the existing implementation, preserve its className/markup.**
- [ ] **Step 2: Convert to client component, wire `usePathname`.**
- [ ] **Step 3: Stage.**

(No test for this — it's a thin wrapper. Manual verification in Task 21.)

---

## Task 18: `/coach` server component + page client shell

**Files:**
- Create `src/app/(app)/coach/page.tsx`
- Create `src/app/(app)/coach/CoachPageClient.tsx`
- Create `src/app/(app)/coach/Coach.module.scss`

Server component:
```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadHistory } from "@/coach/messages";
import { CoachPageClient } from "./CoachPageClient";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { from } = await searchParams;
  const messages = await loadHistory(session.user.id);
  return <CoachPageClient initialMessages={messages} fromRoute={from} />;
}
```

Client shell scaffolding (renders the chat layout + handlers — actual streaming logic + components in later tasks):

```tsx
"use client";
import { useState } from "react";
import styles from "./Coach.module.scss";
import { ContextPill } from "@/components/coach/ContextPill";
import { MessageBubble } from "@/components/coach/MessageBubble";
import { ToolIndicator } from "@/components/coach/ToolIndicator";
import { MessageInput } from "@/components/coach/MessageInput";
import { ClearChatDialog } from "@/components/coach/ClearChatDialog";
import type { StoredMessage, SSEEvent } from "@/coach/types";

interface Props {
  initialMessages: StoredMessage[];
  fromRoute?: string;
}

export function CoachPageClient({ initialMessages, fromRoute }: Props) {
  const [messages, setMessages] = useState<StoredMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState<{ text: string; tools: { name: string; summary?: string }[] } | null>(null);
  const [sending, setSending] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  // ... send/clear handlers wired in Task 19
  return (
    <div className={styles.page}>
      <ContextPill fromRoute={fromRoute} />
      <header className={styles.header}>
        <h1 className={styles.title}>Coach</h1>
        <button className={styles.clearBtn} onClick={() => setClearOpen(true)}>Clear chat</button>
      </header>
      <div className={styles.stream}>
        {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
        {streaming && (
          <>
            {streaming.tools.map((t, i) => <ToolIndicator key={i} name={t.name} summary={t.summary} />)}
            <MessageBubble message={{ id: "streaming", role: "assistant", created_at: new Date(), content: [{ type: "text", text: streaming.text }] }} />
          </>
        )}
      </div>
      <MessageInput disabled={sending} onSend={(text) => { /* wired in Task 19 */ }} />
      <ClearChatDialog open={clearOpen} onClose={() => setClearOpen(false)} onConfirm={async () => { /* wired in Task 19 */ }} />
    </div>
  );
}
```

Coach.module.scss:
```scss
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: calc(100vh - 80px); // viewport minus app shell header
  max-width: 760px;
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.title {
  flex: 1;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.375rem;
  margin: 0;
}

.clearBtn {
  background: none;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: 6px 12px;
  font-family: var(--font-body);
  font-size: 0.8125rem;
  color: var(--color-fg-secondary);
  cursor: pointer;
  &:hover { color: var(--color-brown); border-color: var(--color-brown); }
}

.stream {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
}
```

- [ ] **Step 1: Write the three files.**
- [ ] **Step 2: Stage.**

---

## Task 19: Chat presentational components + streaming

**Files:**
- Create `src/components/coach/MessageBubble.tsx` + `.module.scss`
- Create `src/components/coach/MessageInput.tsx` + `.module.scss`
- Create `src/components/coach/ToolIndicator.tsx` + `.module.scss`
- Create `src/components/coach/ContextPill.tsx` + `.module.scss`
- Create `src/components/coach/ClearChatDialog.tsx` + `.module.scss`
- Modify: `src/app/(app)/coach/CoachPageClient.tsx` — wire send + clear

### MessageBubble

Renders `role` user (right-aligned, brown bg) vs assistant (left-aligned, surface bg with markdown via `react-markdown` + `remark-gfm`). Skip rendering `tool_use` / `tool_result` / `thinking` blocks — only render `text` blocks.

```tsx
"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./MessageBubble.module.scss";
import type { StoredMessage } from "@/coach/types";

export function MessageBubble({ message }: { message: StoredMessage }) {
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n\n");
  if (!text.trim()) return null;
  return (
    <div className={message.role === "user" ? styles.user : styles.assistant}>
      <div className={styles.bubble}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  );
}
```

Note: the user-bubble text contains the context prefix (we persist it that way so it round-trips back to Claude). The bubble component should strip the leading `<context>...</context>\n\n` block before rendering. Add a small helper:

```ts
function stripContext(text: string): string {
  return text.replace(/^<context>[\s\S]*?<\/context>\s*/, "");
}
```

Use it in the user role render path.

### ToolIndicator

```tsx
import styles from "./ToolIndicator.module.scss";
export function ToolIndicator({ name, summary }: { name: string; summary?: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.dot} />
      <span className={styles.label}>
        {summary ?? `Calling ${name.replace(/_/g, " ")}…`}
      </span>
    </div>
  );
}
```
SCSS: small italic gray row with a pulsing dot.

### ContextPill

```tsx
"use client";
import Link from "next/link";
import styles from "./ContextPill.module.scss";
import { routeLabel } from "@/coach/context";

export function ContextPill({ fromRoute }: { fromRoute?: string }) {
  const label = routeLabel(fromRoute);
  if (!label) return null;
  return (
    <Link href={fromRoute!} className={styles.pill}>
      ← Back to {label}
    </Link>
  );
}
```

### MessageInput

```tsx
"use client";
import { useState, type KeyboardEvent } from "react";
import styles from "./MessageInput.module.scss";

export function MessageInput({ disabled, onSend }: { disabled?: boolean; onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  function send() {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue("");
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
  return (
    <div className={styles.row}>
      <textarea
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask the coach…"
        rows={2}
        disabled={disabled}
      />
      <button className={styles.send} disabled={disabled || !value.trim()} onClick={send}>
        Send
      </button>
    </div>
  );
}
```

### ClearChatDialog

Wraps `@radix-ui/react-dialog` (already installed). Confirm copy: "This wipes the current chat. Your coach notes will not be affected."

### CoachPageClient — streaming wire-up

Implement the `onSend` handler:

```ts
async function send(text: string) {
  setSending(true);

  // Optimistically append user message (without context prefix — server adds it).
  const userMsg: StoredMessage = {
    id: `tmp-${Date.now()}`,
    role: "user",
    created_at: new Date(),
    content: [{ type: "text", text }],
  };
  setMessages((prev) => [...prev, userMsg]);
  setStreaming({ text: "", tools: [] });

  try {
    const res = await fetch("/api/coach/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text, from_route: fromRoute }),
    });
    if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status}`);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let assembledText = "";
    const tools: { name: string; summary?: string }[] = [];

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      // Parse SSE: events are separated by "\n\n"; each starts with "event: <type>\n" then "data: <json>\n"
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        const ev = JSON.parse(dataLine.slice(6)) as SSEEvent;
        if (ev.type === "text-delta") {
          assembledText += ev.delta;
          setStreaming({ text: assembledText, tools: [...tools] });
        } else if (ev.type === "tool-use") {
          tools.push({ name: ev.name });
          setStreaming({ text: assembledText, tools: [...tools] });
        } else if (ev.type === "tool-result") {
          const last = tools.findLast((t) => t.name === ev.name && !t.summary);
          if (last) last.summary = ev.result_summary;
          setStreaming({ text: assembledText, tools: [...tools] });
        } else if (ev.type === "done") {
          // Reload full history to get the canonical persisted messages.
          const r = await fetch("/api/coach/messages");
          if (r.ok) {
            const { messages: m } = await r.json() as { messages: StoredMessage[] };
            setMessages(m);
          }
        } else if (ev.type === "error") {
          throw new Error(ev.error);
        }
      }
    }
  } catch (err) {
    console.error(err);
    alert("Coach error — please try again.");
  } finally {
    setStreaming(null);
    setSending(false);
  }
}

async function clear() {
  await fetch("/api/coach/messages", { method: "DELETE" });
  setMessages([]);
  setClearOpen(false);
}
```

- [ ] **Step 1: Build the five presentational components.** Each should compile clean (no tests for visual components).
- [ ] **Step 2: Wire `send` + `clear` into `CoachPageClient`.**
- [ ] **Step 3: `npm test -- --run`** to confirm nothing regressed.
- [ ] **Step 4: Stage.**

---

## Task 20: Coach notes editor in `/settings`

**Files:**
- Create `src/components/coach/CoachNotesEditor.tsx` + `.module.scss`
- Modify: `src/app/(app)/settings/<existing form file>` to mount the editor

The editor: a `<textarea>` (max length 4096) + Save button. Posts to `PUT /api/coach/notes`. Shows a small "Updated coach notes" toast on success. No optimistic update.

```tsx
"use client";
import { useState } from "react";
import styles from "./CoachNotesEditor.module.scss";

export function CoachNotesEditor({ initialContent }: { initialContent: string }) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/coach/notes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      setSavedAt(new Date());
    } catch (err) {
      console.error(err);
      alert("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.title}>Coach notes</h3>
      <p className={styles.help}>The coach's durable memory about you. The coach edits this automatically as your goals shift, but you can also edit directly. Max 4 KB.</p>
      <textarea
        className={styles.textarea}
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, 4096))}
        rows={10}
      />
      <div className={styles.row}>
        <span className={styles.counter}>{content.length} / 4096</span>
        <span className={styles.spacer} />
        {savedAt && <span className={styles.saved}>Saved {savedAt.toLocaleTimeString()}</span>}
        <button className={styles.save} onClick={save} disabled={saving}>Save</button>
      </div>
    </section>
  );
}
```

The settings page server component should fetch the current notes (via DB or via the GET /api/coach/notes endpoint — DB is cheaper from a server component) and pass them as `initialContent`.

- [ ] **Step 1: Read the existing settings page** at `src/app/(app)/settings/page.tsx` (or wherever) and understand the existing form layout.
- [ ] **Step 2: Add the editor as a new section** below the existing preferences form.
- [ ] **Step 3: Stage.**

---

## Task 21: Apply migration + smoke test the full loop

**Files:** none (operational)

- [ ] **Step 1: Apply migration.** `npm run db:migrate` (the `messages` table + `matched_workout_id` column).
- [ ] **Step 2: Set `ANTHROPIC_API_KEY`** in `.env`.
- [ ] **Step 3: Restart `npm run dev`.**
- [ ] **Step 4: Open `/today` (or any page), click the Ask Coach button.** Verify URL is `/coach?from=/today` and the back-pill says "← Back to Today view".
- [ ] **Step 5: Send a message** like "what did I run last week?". Confirm:
  - Streaming text deltas render token-by-token.
  - A `ToolIndicator` shows "Read recent activities" briefly, then disappears (replaced by the assistant message).
  - Final message persists; refresh the page and the message is still there.
- [ ] **Step 6: Test a write tool.** "Add 4 easy 5-mile runs to my plan, Mon-Thu next week." Confirm the workouts land in the `workout` table for the active plan; refresh `/calendar` (it's still empty UI-wise, but the DB should have new rows).
- [ ] **Step 7: Edit coach notes.** In `/settings`, type "Goal: sub-3:05 Boston. No injuries." and Save. Confirm `users.coach_notes` updates. Send another coach message and verify the notes are reflected in the response (e.g., "what's my goal?" should reference Boston).
- [ ] **Step 8: Clear chat.** Verify the dialog appears, confirms the action, and that `messages` is empty after. **Confirm `coach_notes` survives.**

---

## Self-review

Before declaring Phase 4 done, verify:

1. **Spec coverage**:
   - § 7 Coach loop — system prompt frozen ✓, cache breakpoint after system ✓, per-turn context with date / units / active plan / coach notes / from-route ✓, streaming with text-delta / tool-use / tool-result / done events ✓, Clear chat does NOT touch coach_notes ✓.
   - § 4 Routes — `/api/coach/chat` (SSE), `/api/coach/messages` (GET + DELETE), `/api/coach/notes` (GET + PUT) all live ✓.
   - § 6 `messages` schema — uuid pk, user_id fk cascade, role enum, content jsonb, created_at ✓.
   - § 10 Coach panel — single rolling chat, Clear chat button + confirm, Coach notes editor link, streaming with tool indicators, markdown rendering ✓.
2. **Phase boundary**: did NOT build upload pipeline (Phase 6), Today/Calendar UI (Phase 5), or workout matching (Phase 5). The `update_activity_match` *tool* exists (it's a coach tool per spec), and we added `activities.matched_workout_id` to enable it — but no UI surfaces matching yet. ✓
3. **Driver compat**: every multi-row mutation in tools is single-statement (no `db.transaction`).
4. **Auth + ownership**: every API route checks `auth()`. Every tool handler verifies ownership before mutating (re-reads via `getPlanById` or analogous).
5. **No "Co-Authored-By" trailers in commits** (the user will commit themselves).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-26-phase-4-coach.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review (spec compliance → code quality). Subagents will be told NOT to commit; you commit between batches.
2. **Inline Execution** — `superpowers:executing-plans` in this session.

Which approach?
