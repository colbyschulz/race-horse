# Phase 3: Plans + Manage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the `plans` and `workouts` schema, the `/plans` manage page (PlansA "Card list" hi-fi variant), and the RESTful API surface that Phase 4 (coach) and Phase 6 (upload) will reuse to create and mutate plans.

**Architecture:**

- New Drizzle tables `plans` + `workouts` with pg enums for `sport`, `plan_mode`, `plan_source`, `workout_type`. A partial unique index `(user_id) WHERE is_active` enforces "at most one active plan per user" at the DB level.
- A `src/plans/` module owns DB access and small pure helpers:
  - `queries.ts` — `listPlans`, `getPlanById`, `createPlan`, `setActivePlan`, `archivePlan`, `deletePlan`, `countWorkouts`, `countCompletedSoFar`
  - `stats.ts` — pure formatters: `computeWeeksLeft`, `formatDuration`, `formatGoal`, `formatSport`
- RESTful API routes under `/api/plans`:
  - `GET /api/plans` — list current user's plans
  - `POST /api/plans` — create a plan (used by Phase 4 coach + Phase 6 upload, plus dev-only seeding for now)
  - `GET /api/plans/:id` — read a single plan (ownership-checked)
  - `PATCH /api/plans/:id` — currently only supports `{ is_active: true }` to activate / restore
  - `DELETE /api/plans/:id` — hard delete (cascades workouts)
- The `/plans` page is a server component that fetches plans + workout counts and hands off to a small client component for action wiring (POST/PATCH/DELETE + `router.refresh()` to re-render). The active card shows `Weeks left | Workouts | Completed`, where "Completed" is the count of workouts whose `date <= today` (a deliberate proxy until Phase 5 wires up real activity-to-workout matching).
- The hi-fi's `[✦ Build with coach]` and `[↑ Upload plan]` action-row buttons are rendered as disabled placeholders with a small "coming soon" tooltip — the visual surface lands now so Phase 4/6 only need to wire behavior, not retro-fit chrome.

**Tech Stack:**

- Next.js 16 App Router server components + client components
- Drizzle ORM with `pgEnum` and partial unique indexes
- Existing: Neon Postgres (HTTP driver — _no transactions_, so all mutations are single statements), NextAuth v5, Vitest, SCSS Modules

**Design tokens used (already defined in `src/styles/tokens.scss`):**

- `--color-brown` / `--color-brown-hover` — active accent + hero ring
- `--color-bg-base` / `--color-bg-surface` / `--color-bg-subtle` — page + card backgrounds
- `--color-fg-primary` / `--color-fg-secondary` / `--color-fg-tertiary` — typography hierarchy
- `--color-border-subtle` / `--color-border-default` — card borders
- `--shadow-sm` — card lift
- `--space-1`..`--space-8`, `--radius-sm`..`--radius-pill` — spacing + radius scale
- `--font-display` (Syne) for plan titles, `--font-body` (Roboto) elsewhere

---

## File structure

**Create:**

- `src/plans/queries.ts` — DB access for plans + workouts
- `src/plans/stats.ts` — pure presentation helpers
- `src/plans/types.ts` — shared TS types: `Goal`, `TargetIntensity`, `Interval`, `PlanWithCounts`
- `src/plans/__tests__/queries.test.ts`
- `src/plans/__tests__/stats.test.ts`
- `src/app/api/plans/route.ts` — `GET` list + `POST` create
- `src/app/api/plans/__tests__/route.test.ts`
- `src/app/api/plans/[id]/route.ts` — `GET` / `PATCH` / `DELETE`
- `src/app/api/plans/[id]/__tests__/route.test.ts`
- `src/app/(app)/plans/PlansPageClient.tsx` — client component
- `src/app/(app)/plans/Plans.module.scss` — page-level styles
- `src/components/plans/ActivePlanCard.tsx` + `.module.scss`
- `src/components/plans/ArchivedPlanCard.tsx` + `.module.scss`
- `src/components/plans/PlanActionRow.tsx` + `.module.scss` — the "Build with coach" / "Upload plan" disabled buttons
- `src/components/plans/PlansEmptyState.tsx` + `.module.scss`

**Modify:**

- `src/db/schema.ts` — add enums + plans + workouts tables
- `src/db/__tests__/schema.test.ts` — extend coverage
- `src/app/(app)/plans/page.tsx` — replace Phase 1 placeholder with real server component

**Generate (via drizzle-kit):**

- `drizzle/0002_<name>.sql` — migration

---

## External setup

None. Phase 3 introduces no new env vars or external services.

---

## Task 1: Schema — `plans` + `workouts` tables + enums

**Files:**

- Modify: `src/db/schema.ts`
- Modify: `src/db/__tests__/schema.test.ts`
- Generate: `drizzle/0002_<name>.sql`

- [ ] **Step 1: Add enum + table imports**

In `src/db/schema.ts`, extend the `drizzle-orm/pg-core` import:

```ts
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  primaryKey,
  integer,
  jsonb,
  uuid,
  bigint,
  numeric,
  index,
  uniqueIndex,
  date,
  boolean,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Add enums after `DEFAULT_PREFERENCES`**

Add these `pgEnum` declarations between `DEFAULT_PREFERENCES` and the `users` table:

```ts
export const sportEnum = pgEnum("sport", ["run", "bike"]);
export const planModeEnum = pgEnum("plan_mode", ["goal", "indefinite"]);
export const planSourceEnum = pgEnum("plan_source", ["uploaded", "coach_generated"]);
export const workoutTypeEnum = pgEnum("workout_type", [
  "easy",
  "long",
  "tempo",
  "threshold",
  "intervals",
  "recovery",
  "race",
  "rest",
  "cross",
]);

export type Goal = {
  race_date?: string; // ISO date "YYYY-MM-DD"
  race_distance?: string; // free-text e.g. "marathon", "10k", "50k"
  target_time?: string; // free-text e.g. "3:05"
};

export type TargetIntensity = {
  pace?: { min_seconds_per_km?: number; max_seconds_per_km?: number };
  power?: { min_watts?: number; max_watts?: number };
  hr?: { min_bpm?: number; max_bpm?: number } | { zone: string };
  rpe?: number;
};

export type IntervalSpec = {
  reps: number;
  distance_m?: number;
  duration_s?: number;
  target_intensity?: TargetIntensity;
  rest?: { duration_s?: number; distance_m?: number };
};
```

- [ ] **Step 3: Add `plans` table**

After the `activityLaps` table at the bottom of `src/db/schema.ts`, append:

```ts
export const plans = pgTable(
  "plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sport: sportEnum("sport").notNull(),
    mode: planModeEnum("mode").notNull(),
    goal: jsonb("goal").$type<Goal>(),
    start_date: date("start_date", { mode: "string" }).notNull(),
    end_date: date("end_date", { mode: "string" }),
    is_active: boolean("is_active").notNull().default(false),
    source: planSourceEnum("source").notNull(),
    source_file_id: uuid("source_file_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("plan_user_idx").on(t.userId),
    uniqueIndex("plan_one_active_per_user_idx")
      .on(t.userId)
      .where(sql`${t.is_active}`),
  ]
);
```

Add `import { sql } from "drizzle-orm";` at the top of the file (just after the `pg-core` import).

- [ ] **Step 4: Add `workouts` table**

Right after `plans`:

```ts
export const workouts = pgTable(
  "workout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plan_id: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    sport: sportEnum("sport").notNull(),
    type: workoutTypeEnum("type").notNull(),
    distance_meters: numeric("distance_meters"),
    duration_seconds: integer("duration_seconds"),
    target_intensity: jsonb("target_intensity").$type<TargetIntensity>(),
    intervals: jsonb("intervals").$type<IntervalSpec[]>(),
    notes: text("notes").notNull().default(""),
  },
  (t) => [index("workout_plan_date_idx").on(t.plan_id, t.date)]
);
```

- [ ] **Step 5: Generate migration**

Run: `npm run db:generate`
Expected: drizzle-kit emits `drizzle/0002_<adjective_noun>.sql` containing:

- `CREATE TYPE "public"."sport" AS ENUM('run', 'bike');`
- `CREATE TYPE "public"."plan_mode" AS ENUM('goal', 'indefinite');`
- `CREATE TYPE "public"."plan_source" AS ENUM('uploaded', 'coach_generated');`
- `CREATE TYPE "public"."workout_type" AS ENUM(...);`
- `CREATE TABLE "plan" (...)`
- `CREATE TABLE "workout" (...)`
- `CREATE INDEX "plan_user_idx" ...`
- `CREATE UNIQUE INDEX "plan_one_active_per_user_idx" ON "plan" ("userId") WHERE "is_active";`
- `CREATE INDEX "workout_plan_date_idx" ...`

If drizzle-kit emits any `DROP` statements, **stop and investigate** — Phase 2 columns must remain.

- [ ] **Step 6: Inspect migration**

Open the generated SQL file. Verify:

- `is_active` defaults to `false`
- The partial unique index uses `WHERE "is_active"` (not just `WHERE "is_active" = true` — both work, but check it actually has a `WHERE` clause)
- `start_date` / `end_date` / `workout.date` are all `date` columns (not `timestamp`)

- [ ] **Step 7: Extend schema test**

Add to `src/db/__tests__/schema.test.ts`:

```ts
import { plans, workouts, sportEnum, planModeEnum, workoutTypeEnum } from "@/db/schema";

describe("plans table", () => {
  it("declares the expected columns", () => {
    const cols = Object.keys(plans);
    for (const c of [
      "id",
      "userId",
      "title",
      "sport",
      "mode",
      "goal",
      "start_date",
      "end_date",
      "is_active",
      "source",
      "source_file_id",
      "created_at",
      "updated_at",
    ]) {
      expect(cols).toContain(c);
    }
  });
});

describe("workouts table", () => {
  it("declares the expected columns", () => {
    const cols = Object.keys(workouts);
    for (const c of [
      "id",
      "plan_id",
      "date",
      "sport",
      "type",
      "distance_meters",
      "duration_seconds",
      "target_intensity",
      "intervals",
      "notes",
    ]) {
      expect(cols).toContain(c);
    }
  });
});

describe("enums", () => {
  it("sportEnum declares run and bike", () => {
    expect(sportEnum.enumValues).toEqual(["run", "bike"]);
  });
  it("planModeEnum declares goal and indefinite", () => {
    expect(planModeEnum.enumValues).toEqual(["goal", "indefinite"]);
  });
  it("workoutTypeEnum declares the 9 types", () => {
    expect(workoutTypeEnum.enumValues).toEqual([
      "easy",
      "long",
      "tempo",
      "threshold",
      "intervals",
      "recovery",
      "race",
      "rest",
      "cross",
    ]);
  });
});
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/db/__tests__/schema.test.ts`
Expected: PASS — all new + existing schema assertions green.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts src/db/__tests__/schema.test.ts drizzle/
git commit -m "Add plans and workouts schema with enums and partial unique active index"
```

---

## Task 2: Plans + workouts shared types

**Files:**

- Create: `src/plans/types.ts`

- [ ] **Step 1: Write the types file**

```ts
import type { Goal, TargetIntensity, IntervalSpec } from "@/db/schema";

export type Sport = "run" | "bike";
export type PlanMode = "goal" | "indefinite";
export type PlanSource = "uploaded" | "coach_generated";

export type Plan = {
  id: string;
  userId: string;
  title: string;
  sport: Sport;
  mode: PlanMode;
  goal: Goal | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  is_active: boolean;
  source: PlanSource;
  source_file_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type PlanWithCounts = Plan & {
  workout_count: number;
  completed_count: number; // workouts with date <= today (proxy until Phase 5)
};

export type CreatePlanInput = {
  title: string;
  sport: Sport;
  mode: PlanMode;
  goal?: Goal;
  start_date: string;
  end_date?: string | null;
  source: PlanSource;
  source_file_id?: string | null;
};

export type { Goal, TargetIntensity, IntervalSpec };
```

- [ ] **Step 2: Commit**

```bash
git add src/plans/types.ts
git commit -m "Add shared TS types for plans"
```

---

## Task 3: Plans queries — `listPlans`, `getPlanById`, `createPlan`

**Files:**

- Create: `src/plans/queries.ts`
- Create: `src/plans/__tests__/queries.test.ts`

- [ ] **Step 1: Write the failing test for `listPlans`**

`src/plans/__tests__/queries.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fromChain = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
};
const selectChain = {
  from: vi.fn(() => fromChain),
};
const insertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};
const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};
const deleteChain = {
  where: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/db", () => ({
  db: {
    select: () => selectChain,
    insert: () => insertChain,
    update: () => updateChain,
    delete: () => deleteChain,
  },
}));
vi.mock("@/db/schema", () => ({
  plans: { id: "id", userId: "userId", is_active: "is_active", start_date: "start_date" },
  workouts: { id: "id", plan_id: "plan_id", date: "date" },
}));

import { listPlans } from "../queries";

describe("listPlans", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.orderBy.mockClear().mockReturnThis();
  });

  it("returns plans for the user, active first then by start_date desc", async () => {
    const rows = [
      { id: "p1", userId: "u1", is_active: true, start_date: "2026-01-01" },
      { id: "p2", userId: "u1", is_active: false, start_date: "2025-09-01" },
    ];
    fromChain.orderBy.mockResolvedValueOnce(rows);
    const result = await listPlans("u1");
    expect(result).toEqual(rows);
    expect(fromChain.where).toHaveBeenCalled();
    expect(fromChain.orderBy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run src/plans/__tests__/queries.test.ts`
Expected: FAIL — `Cannot find module '../queries'`.

- [ ] **Step 3: Implement `listPlans` (and stub other exports)**

`src/plans/queries.ts`:

```ts
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import type { CreatePlanInput, Plan, PlanWithCounts } from "./types";

export async function listPlans(userId: string): Promise<Plan[]> {
  return db
    .select()
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.is_active), desc(plans.start_date)) as Promise<Plan[]>;
}

export async function getPlanById(planId: string, userId: string): Promise<Plan | null> {
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .limit(1);
  return (rows[0] as Plan | undefined) ?? null;
}

export async function createPlan(userId: string, input: CreatePlanInput): Promise<Plan> {
  const result = await db
    .insert(plans)
    .values({
      userId,
      title: input.title,
      sport: input.sport,
      mode: input.mode,
      goal: input.goal ?? null,
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      source: input.source,
      source_file_id: input.source_file_id ?? null,
      is_active: false,
      updated_at: new Date(),
    })
    .returning();
  if (!result[0]) throw new Error("createPlan: no row returned");
  return result[0] as Plan;
}

// Placeholder exports — implemented in Task 4 / 5
export async function setActivePlan(_planId: string, _userId: string): Promise<void> {
  throw new Error("not implemented");
}
export async function archivePlan(_planId: string, _userId: string): Promise<void> {
  throw new Error("not implemented");
}
export async function deletePlan(_planId: string, _userId: string): Promise<void> {
  throw new Error("not implemented");
}
export async function listPlansWithCounts(
  _userId: string,
  _today: string
): Promise<PlanWithCounts[]> {
  throw new Error("not implemented");
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npx vitest run src/plans/__tests__/queries.test.ts`
Expected: PASS — `listPlans` test green.

- [ ] **Step 5: Add tests for `getPlanById` and `createPlan`**

Append to `src/plans/__tests__/queries.test.ts`:

```ts
import { getPlanById, createPlan } from "../queries";

describe("getPlanById", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.limit.mockClear().mockReturnThis();
  });

  it("returns the plan when ownership matches", async () => {
    fromChain.limit.mockResolvedValueOnce([{ id: "p1", userId: "u1" }]);
    const result = await getPlanById("p1", "u1");
    expect(result).toEqual({ id: "p1", userId: "u1" });
  });

  it("returns null when no row", async () => {
    fromChain.limit.mockResolvedValueOnce([]);
    const result = await getPlanById("p-missing", "u1");
    expect(result).toBeNull();
  });
});

describe("createPlan", () => {
  beforeEach(() => {
    insertChain.values.mockClear().mockReturnThis();
    insertChain.returning.mockReset();
  });

  it("inserts and returns the row", async () => {
    insertChain.returning.mockResolvedValueOnce([
      { id: "p-new", userId: "u1", title: "Boston", sport: "run" },
    ]);
    const out = await createPlan("u1", {
      title: "Boston",
      sport: "run",
      mode: "goal",
      start_date: "2026-01-01",
      end_date: "2026-04-20",
      source: "coach_generated",
    });
    expect(out.id).toBe("p-new");
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        title: "Boston",
        sport: "run",
        mode: "goal",
        is_active: false,
      })
    );
  });

  it("throws when insert returns no rows", async () => {
    insertChain.returning.mockResolvedValueOnce([]);
    await expect(
      createPlan("u1", {
        title: "x",
        sport: "run",
        mode: "indefinite",
        start_date: "2026-01-01",
        source: "coach_generated",
      })
    ).rejects.toThrow("createPlan: no row returned");
  });
});
```

- [ ] **Step 6: Run tests, expect pass**

Run: `npx vitest run src/plans/__tests__/queries.test.ts`
Expected: 4 passing.

- [ ] **Step 7: Commit**

```bash
git add src/plans/queries.ts src/plans/__tests__/queries.test.ts
git commit -m "Add listPlans, getPlanById, createPlan with tests"
```

---

## Task 4: Plans queries — `setActivePlan`, `archivePlan`, `deletePlan`

**Files:**

- Modify: `src/plans/queries.ts`
- Modify: `src/plans/__tests__/queries.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/plans/__tests__/queries.test.ts`:

```ts
import { setActivePlan, archivePlan, deletePlan } from "../queries";

describe("setActivePlan", () => {
  beforeEach(() => {
    updateChain.set.mockClear().mockReturnThis();
    updateChain.where.mockClear().mockResolvedValue(undefined);
  });

  it("issues a single UPDATE that flips is_active per row", async () => {
    await setActivePlan("p1", "u1");
    expect(updateChain.set).toHaveBeenCalledOnce();
    expect(updateChain.where).toHaveBeenCalledOnce();
    const setArg = updateChain.set.mock.calls[0][0];
    // The set object should contain an is_active expression keyed off the target id
    expect(setArg).toHaveProperty("is_active");
    expect(setArg).toHaveProperty("updated_at");
  });
});

describe("archivePlan", () => {
  beforeEach(() => {
    updateChain.set.mockClear().mockReturnThis();
    updateChain.where.mockClear().mockResolvedValue(undefined);
  });

  it("sets is_active=false scoped to plan + user", async () => {
    await archivePlan("p1", "u1");
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
    expect(updateChain.where).toHaveBeenCalledOnce();
  });
});

describe("deletePlan", () => {
  beforeEach(() => {
    deleteChain.where.mockClear().mockResolvedValue(undefined);
  });

  it("issues a DELETE scoped to plan + user", async () => {
    await deletePlan("p1", "u1");
    expect(deleteChain.where).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run src/plans/__tests__/queries.test.ts`
Expected: 3 fails — placeholder implementations throw `not implemented`.

- [ ] **Step 3: Implement the three functions**

Replace the three placeholder exports in `src/plans/queries.ts` with:

```ts
export async function setActivePlan(planId: string, userId: string): Promise<void> {
  // Single UPDATE so the partial unique index is never violated mid-statement.
  // Postgres evaluates the SET expression per row atomically inside one statement.
  await db
    .update(plans)
    .set({
      is_active: sql`(${plans.id} = ${planId})`,
      updated_at: new Date(),
    })
    .where(eq(plans.userId, userId));
}

export async function archivePlan(planId: string, userId: string): Promise<void> {
  await db
    .update(plans)
    .set({ is_active: false, updated_at: new Date() })
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
}

export async function deletePlan(planId: string, userId: string): Promise<void> {
  await db.delete(plans).where(and(eq(plans.id, planId), eq(plans.userId, userId)));
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run src/plans/__tests__/queries.test.ts`
Expected: All passing.

- [ ] **Step 5: Commit**

```bash
git add src/plans/queries.ts src/plans/__tests__/queries.test.ts
git commit -m "Implement setActivePlan, archivePlan, deletePlan"
```

---

## Task 5: `listPlansWithCounts` — counts of total + completed-so-far workouts

**Files:**

- Modify: `src/plans/queries.ts`
- Modify: `src/plans/__tests__/queries.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/plans/__tests__/queries.test.ts`:

```ts
import { listPlansWithCounts } from "../queries";

describe("listPlansWithCounts", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.orderBy.mockClear().mockReturnThis();
  });

  it("annotates each plan with workout_count + completed_count", async () => {
    fromChain.orderBy.mockResolvedValueOnce([
      {
        id: "p1",
        userId: "u1",
        title: "Boston",
        is_active: true,
        start_date: "2026-01-01",
        end_date: "2026-04-20",
        workout_count: 84,
        completed_count: 46,
      },
    ]);
    const out = await listPlansWithCounts("u1", "2026-03-01");
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(
      expect.objectContaining({
        id: "p1",
        workout_count: 84,
        completed_count: 46,
      })
    );
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run src/plans/__tests__/queries.test.ts -t listPlansWithCounts`
Expected: FAIL — `not implemented`.

- [ ] **Step 3: Implement `listPlansWithCounts`**

Replace the placeholder in `src/plans/queries.ts`:

```ts
export async function listPlansWithCounts(
  userId: string,
  today: string // ISO date "YYYY-MM-DD"
): Promise<PlanWithCounts[]> {
  // Single round-trip: subquery counts joined per row.
  const totalCount = sql<number>`(
    SELECT COUNT(*)::int FROM ${workouts}
    WHERE ${workouts.plan_id} = ${plans.id}
  )`.as("workout_count");

  const completedCount = sql<number>`(
    SELECT COUNT(*)::int FROM ${workouts}
    WHERE ${workouts.plan_id} = ${plans.id}
      AND ${workouts.date} <= ${today}::date
  )`.as("completed_count");

  return db
    .select({
      id: plans.id,
      userId: plans.userId,
      title: plans.title,
      sport: plans.sport,
      mode: plans.mode,
      goal: plans.goal,
      start_date: plans.start_date,
      end_date: plans.end_date,
      is_active: plans.is_active,
      source: plans.source,
      source_file_id: plans.source_file_id,
      created_at: plans.created_at,
      updated_at: plans.updated_at,
      workout_count: totalCount,
      completed_count: completedCount,
    })
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.is_active), desc(plans.start_date)) as Promise<PlanWithCounts[]>;
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run src/plans/__tests__/queries.test.ts`
Expected: All passing.

- [ ] **Step 5: Commit**

```bash
git add src/plans/queries.ts src/plans/__tests__/queries.test.ts
git commit -m "Add listPlansWithCounts with workout + completed counts"
```

---

## Task 6: Plans stats — pure formatters

**Files:**

- Create: `src/plans/stats.ts`
- Create: `src/plans/__tests__/stats.test.ts`

- [ ] **Step 1: Write failing tests**

`src/plans/__tests__/stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeWeeksLeft, formatDuration, formatGoal, formatSport } from "../stats";

describe("computeWeeksLeft", () => {
  it("returns ceil of (end - today) / 7 days, never negative", () => {
    expect(computeWeeksLeft("2026-05-05", "2026-04-26")).toBe(2); // 9 days
    expect(computeWeeksLeft("2026-04-26", "2026-04-26")).toBe(0);
    expect(computeWeeksLeft("2026-01-01", "2026-04-26")).toBe(0); // past end
  });
  it("returns null when end_date is null", () => {
    expect(computeWeeksLeft(null, "2026-04-26")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("returns indefinite when end is null", () => {
    expect(formatDuration("2026-01-01", null)).toBe("indefinite");
  });
  it("returns weeks for goal plans, rounded", () => {
    expect(formatDuration("2026-01-01", "2026-04-23")).toBe("16 weeks"); // 16w 1d
    expect(formatDuration("2026-01-01", "2026-05-21")).toBe("20 weeks");
  });
});

describe("formatGoal", () => {
  it("formats target_time + race_date when present", () => {
    expect(formatGoal({ target_time: "3:05", race_date: "2026-05-05" })).toBe("Goal: 3:05 · May 5");
  });
  it("falls back to race_distance when no target_time", () => {
    expect(formatGoal({ race_distance: "marathon", race_date: "2026-05-05" })).toBe(
      "Goal: marathon · May 5"
    );
  });
  it("returns null when goal is null or empty", () => {
    expect(formatGoal(null)).toBeNull();
    expect(formatGoal({})).toBeNull();
  });
});

describe("formatSport", () => {
  it("renders run with shoe emoji", () => {
    expect(formatSport("run")).toBe("🏃 Run");
  });
  it("renders bike with bike emoji", () => {
    expect(formatSport("bike")).toBe("🚴 Bike");
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run src/plans/__tests__/stats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/plans/stats.ts`:

```ts
import type { Goal, Sport } from "./types";

const MS_PER_DAY = 86_400_000;

function parseISODate(d: string): Date {
  // Treat as UTC-midnight to avoid TZ drift in week math.
  return new Date(`${d}T00:00:00Z`);
}

export function computeWeeksLeft(endDate: string | null, today: string): number | null {
  if (!endDate) return null;
  const end = parseISODate(endDate).getTime();
  const now = parseISODate(today).getTime();
  const days = Math.ceil((end - now) / MS_PER_DAY);
  return Math.max(0, Math.ceil(days / 7));
}

export function formatDuration(startDate: string, endDate: string | null): string {
  if (!endDate) return "indefinite";
  const start = parseISODate(startDate).getTime();
  const end = parseISODate(endDate).getTime();
  const weeks = Math.round((end - start) / (MS_PER_DAY * 7));
  return `${weeks} weeks`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatRaceDate(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatGoal(goal: Goal | null): string | null {
  if (!goal) return null;
  const tgt = goal.target_time ?? goal.race_distance;
  if (!tgt && !goal.race_date) return null;
  const parts: string[] = [];
  if (tgt) parts.push(tgt);
  if (goal.race_date) parts.push(formatRaceDate(goal.race_date));
  return `Goal: ${parts.join(" · ")}`;
}

export function formatSport(sport: Sport): string {
  return sport === "run" ? "🏃 Run" : "🚴 Bike";
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run src/plans/__tests__/stats.test.ts`
Expected: All passing.

- [ ] **Step 5: Commit**

```bash
git add src/plans/stats.ts src/plans/__tests__/stats.test.ts
git commit -m "Add pure plan stat formatters"
```

---

## Task 7: API `GET /api/plans` + `POST /api/plans`

**Files:**

- Create: `src/app/api/plans/route.ts`
- Create: `src/app/api/plans/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

`src/app/api/plans/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.fn();
const listPlansWithCounts = vi.fn();
const createPlan = vi.fn();

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/plans/queries", () => ({ listPlansWithCounts, createPlan }));

import { GET, POST } from "../route";

function makeReq(body?: unknown): Request {
  return new Request("http://x/api/plans", {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : {},
  });
}

describe("GET /api/plans", () => {
  beforeEach(() => {
    auth.mockReset();
    listPlansWithCounts.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    auth.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns plans for the user", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    listPlansWithCounts.mockResolvedValueOnce([{ id: "p1", title: "Boston" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans).toEqual([{ id: "p1", title: "Boston" }]);
    expect(listPlansWithCounts).toHaveBeenCalledWith("u1", expect.any(String));
  });
});

describe("POST /api/plans", () => {
  beforeEach(() => {
    auth.mockReset();
    createPlan.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    auth.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({
        title: "x",
        sport: "run",
        mode: "indefinite",
        start_date: "2026-01-01",
        source: "coach_generated",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing required fields", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    const res = await POST(makeReq({ title: "x" }));
    expect(res.status).toBe(400);
  });

  it("creates the plan and returns 201", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    createPlan.mockResolvedValueOnce({ id: "p-new", title: "Boston" });
    const res = await POST(
      makeReq({
        title: "Boston",
        sport: "run",
        mode: "goal",
        start_date: "2026-01-01",
        end_date: "2026-05-05",
        goal: { target_time: "3:05", race_date: "2026-05-05" },
        source: "coach_generated",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.plan).toEqual({ id: "p-new", title: "Boston" });
    expect(createPlan).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        title: "Boston",
        sport: "run",
        mode: "goal",
      })
    );
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run src/app/api/plans/__tests__/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

`src/app/api/plans/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createPlan, listPlansWithCounts } from "@/plans/queries";
import type { CreatePlanInput, PlanMode, PlanSource, Sport } from "@/plans/types";

const VALID_SPORTS: Sport[] = ["run", "bike"];
const VALID_MODES: PlanMode[] = ["goal", "indefinite"];
const VALID_SOURCES: PlanSource[] = ["uploaded", "coach_generated"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const plans = await listPlansWithCounts(session.user.id, isoToday());
  return NextResponse.json({ plans });
}

function validate(body: unknown): CreatePlanInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return null;
  if (typeof b.sport !== "string" || !VALID_SPORTS.includes(b.sport as Sport)) return null;
  if (typeof b.mode !== "string" || !VALID_MODES.includes(b.mode as PlanMode)) return null;
  if (typeof b.source !== "string" || !VALID_SOURCES.includes(b.source as PlanSource)) return null;
  if (typeof b.start_date !== "string" || !ISO_DATE.test(b.start_date)) return null;
  if (b.end_date != null && (typeof b.end_date !== "string" || !ISO_DATE.test(b.end_date)))
    return null;
  return {
    title: b.title.trim(),
    sport: b.sport as Sport,
    mode: b.mode as PlanMode,
    goal: (b.goal as CreatePlanInput["goal"]) ?? undefined,
    start_date: b.start_date,
    end_date: (b.end_date as string | null | undefined) ?? null,
    source: b.source as PlanSource,
    source_file_id: (b.source_file_id as string | null | undefined) ?? null,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const input = validate(body);
  if (!input) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const plan = await createPlan(session.user.id, input);
  return NextResponse.json({ plan }, { status: 201 });
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run src/app/api/plans/__tests__/route.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/plans/
git commit -m "Add GET and POST /api/plans"
```

---

## Task 8: API `GET` / `PATCH` / `DELETE /api/plans/[id]`

**Files:**

- Create: `src/app/api/plans/[id]/route.ts`
- Create: `src/app/api/plans/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

`src/app/api/plans/[id]/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.fn();
const getPlanById = vi.fn();
const setActivePlan = vi.fn();
const archivePlan = vi.fn();
const deletePlan = vi.fn();

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/plans/queries", () => ({
  getPlanById,
  setActivePlan,
  archivePlan,
  deletePlan,
}));

import { GET, PATCH, DELETE } from "../route";

function makeReq(method: string, body?: unknown): Request {
  return new Request("http://x/api/plans/p1", {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : {},
  });
}
const ctx = { params: Promise.resolve({ id: "p1" }) };

describe("GET /api/plans/[id]", () => {
  beforeEach(() => {
    auth.mockReset();
    getPlanById.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    auth.mockResolvedValueOnce(null);
    const res = await GET(makeReq("GET"), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when plan not found / not owned", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce(null);
    const res = await GET(makeReq("GET"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns the plan when found", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce({ id: "p1", title: "Boston" });
    const res = await GET(makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: { id: "p1", title: "Boston" } });
  });
});

describe("PATCH /api/plans/[id]", () => {
  beforeEach(() => {
    auth.mockReset();
    getPlanById.mockReset();
    setActivePlan.mockReset();
    archivePlan.mockReset();
  });

  it("calls setActivePlan when is_active=true", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce({ id: "p1" });
    const res = await PATCH(makeReq("PATCH", { is_active: true }), ctx);
    expect(res.status).toBe(200);
    expect(setActivePlan).toHaveBeenCalledWith("p1", "u1");
  });

  it("calls archivePlan when is_active=false", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce({ id: "p1" });
    const res = await PATCH(makeReq("PATCH", { is_active: false }), ctx);
    expect(res.status).toBe(200);
    expect(archivePlan).toHaveBeenCalledWith("p1", "u1");
  });

  it("returns 404 when plan not owned", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq("PATCH", { is_active: true }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when body lacks is_active", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce({ id: "p1" });
    const res = await PATCH(makeReq("PATCH", {}), ctx);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/plans/[id]", () => {
  beforeEach(() => {
    auth.mockReset();
    getPlanById.mockReset();
    deletePlan.mockReset();
  });

  it("returns 404 when plan not owned", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce(null);
    const res = await DELETE(makeReq("DELETE"), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes and returns 204", async () => {
    auth.mockResolvedValueOnce({ user: { id: "u1" } });
    getPlanById.mockResolvedValueOnce({ id: "p1" });
    const res = await DELETE(makeReq("DELETE"), ctx);
    expect(res.status).toBe(204);
    expect(deletePlan).toHaveBeenCalledWith("p1", "u1");
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run src/app/api/plans/[id]/__tests__/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

`src/app/api/plans/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { archivePlan, deletePlan, getPlanById, setActivePlan } from "@/plans/queries";

type Ctx = { params: Promise<{ id: string }> };

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
function notFound(): NextResponse {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const plan = await getPlanById(id, session.user.id);
  if (!plan) return notFound();
  return NextResponse.json({ plan });
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const owned = await getPlanById(id, session.user.id);
  if (!owned) return notFound();

  let body: { is_active?: boolean };
  try {
    body = (await req.json()) as { is_active?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "is_active is required" }, { status: 400 });
  }

  if (body.is_active) {
    await setActivePlan(id, session.user.id);
  } else {
    await archivePlan(id, session.user.id);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const owned = await getPlanById(id, session.user.id);
  if (!owned) return notFound();
  await deletePlan(id, session.user.id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run src/app/api/plans/[id]/__tests__/route.test.ts`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/plans/[id]/
git commit -m "Add GET, PATCH, DELETE /api/plans/[id]"
```

---

## Task 9: `ActivePlanCard` component

**Files:**

- Create: `src/components/plans/ActivePlanCard.tsx`
- Create: `src/components/plans/ActivePlanCard.module.scss`

- [ ] **Step 1: Write the SCSS module**

`src/components/plans/ActivePlanCard.module.scss`:

```scss
.card {
  background: var(--color-bg-surface);
  border: 2px solid var(--color-brown);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.headRow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.title {
  flex: 1;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.0625rem;
  letter-spacing: -0.01em;
  color: var(--color-fg-primary);
  margin: 0;
}

.activePill {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--color-brown);
  color: #fff;
  border-radius: var(--radius-pill);
  padding: 3px 10px;
}

.metaRow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.metaItem {
  font-family: var(--font-body);
  font-size: 0.8125rem;
  color: var(--color-fg-secondary);
}

.statGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.statValue {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.375rem;
  letter-spacing: -0.02em;
  color: var(--color-fg-primary);
  line-height: 1;
}

.statLabel {
  font-family: var(--font-body);
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-fg-tertiary);
}

.divider {
  height: 1px;
  background: var(--color-border-subtle);
  margin: var(--space-2) 0;
}

.actionRow {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.actionGhost {
  background: none;
  border: none;
  padding: 0;
  font-family: var(--font-body);
  font-size: 0.8125rem;
  color: var(--color-fg-tertiary);
  cursor: pointer;

  &:hover {
    color: var(--color-fg-secondary);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.actionDanger {
  composes: actionGhost;
  &:hover {
    color: #b83232;
  }
}

.spacer {
  flex: 1;
}

.viewLink {
  font-family: var(--font-body);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-brown);
  text-decoration: none;
  &:hover {
    color: var(--color-brown-hover);
  }
}
```

- [ ] **Step 2: Write the component**

`src/components/plans/ActivePlanCard.tsx`:

```tsx
"use client";

import Link from "next/link";
import styles from "./ActivePlanCard.module.scss";
import { computeWeeksLeft, formatDuration, formatGoal, formatSport } from "@/plans/stats";
import type { PlanWithCounts } from "@/plans/types";

interface Props {
  plan: PlanWithCounts;
  today: string; // ISO YYYY-MM-DD
  onArchive: () => void;
  onDelete: () => void;
  busy?: boolean;
}

export function ActivePlanCard({ plan, today, onArchive, onDelete, busy }: Props) {
  const weeksLeft = computeWeeksLeft(plan.end_date, today);
  const goalLine = formatGoal(plan.goal);

  return (
    <article className={styles.card}>
      <div className={styles.headRow}>
        <h2 className={styles.title}>{plan.title}</h2>
        <span className={styles.activePill}>Active</span>
      </div>

      <div className={styles.metaRow}>
        <span className={styles.metaItem}>{formatSport(plan.sport)}</span>
        <span className={styles.metaItem}>{formatDuration(plan.start_date, plan.end_date)}</span>
        {goalLine && <span className={styles.metaItem}>{goalLine}</span>}
      </div>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{weeksLeft ?? "—"}</span>
          <span className={styles.statLabel}>Weeks left</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{plan.workout_count}</span>
          <span className={styles.statLabel}>Workouts</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{plan.completed_count}</span>
          <span className={styles.statLabel}>Completed</span>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.actionRow}>
        <button type="button" onClick={onArchive} disabled={busy} className={styles.actionGhost}>
          Archive
        </button>
        <button type="button" onClick={onDelete} disabled={busy} className={styles.actionDanger}>
          Delete
        </button>
        <span className={styles.spacer} />
        <Link href="/calendar" className={styles.viewLink}>
          View plan →
        </Link>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Verify type check**

Run: `npx tsc --noEmit`
Expected: no errors related to this file.

- [ ] **Step 4: Commit**

```bash
git add src/components/plans/ActivePlanCard.tsx src/components/plans/ActivePlanCard.module.scss
git commit -m "Add ActivePlanCard component"
```

---

## Task 10: `ArchivedPlanCard` component

**Files:**

- Create: `src/components/plans/ArchivedPlanCard.tsx`
- Create: `src/components/plans/ArchivedPlanCard.module.scss`

- [ ] **Step 1: Write the SCSS module**

`src/components/plans/ArchivedPlanCard.module.scss`:

```scss
.card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.headRow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.title {
  flex: 1;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.875rem;
  letter-spacing: -0.01em;
  color: var(--color-fg-primary);
  margin: 0;
}

.metaRow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}

.metaItem {
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--color-fg-tertiary);
}

.spacer {
  flex: 1;
}

.actionGhost {
  background: none;
  border: none;
  padding: 0;
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--color-fg-tertiary);
  cursor: pointer;
  &:hover {
    color: var(--color-brown);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.actionDanger {
  composes: actionGhost;
  &:hover {
    color: #b83232;
  }
}
```

- [ ] **Step 2: Write the component**

`src/components/plans/ArchivedPlanCard.tsx`:

```tsx
"use client";

import styles from "./ArchivedPlanCard.module.scss";
import { formatDuration, formatSport } from "@/plans/stats";
import type { PlanWithCounts } from "@/plans/types";

const SOURCE_LABEL: Record<string, string> = {
  uploaded: "uploaded",
  coach_generated: "coach-generated",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonthYear(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

interface Props {
  plan: PlanWithCounts;
  onRestore: () => void;
  onDelete: () => void;
  busy?: boolean;
}

export function ArchivedPlanCard({ plan, onRestore, onDelete, busy }: Props) {
  return (
    <article className={styles.card}>
      <div className={styles.headRow}>
        <h3 className={styles.title}>{plan.title}</h3>
      </div>
      <div className={styles.metaRow}>
        <span className={styles.metaItem}>
          {formatSport(plan.sport)} · {formatDuration(plan.start_date, plan.end_date)} ·{" "}
          {SOURCE_LABEL[plan.source] ?? plan.source}
        </span>
        <span className={styles.metaItem}>{formatMonthYear(plan.start_date)}</span>
        <span className={styles.spacer} />
        <button type="button" onClick={onRestore} disabled={busy} className={styles.actionGhost}>
          Restore
        </button>
        <button type="button" onClick={onDelete} disabled={busy} className={styles.actionDanger}>
          Delete
        </button>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Verify type check**

Run: `npx tsc --noEmit`
Expected: no errors related to this file.

- [ ] **Step 4: Commit**

```bash
git add src/components/plans/ArchivedPlanCard.tsx src/components/plans/ArchivedPlanCard.module.scss
git commit -m "Add ArchivedPlanCard component"
```

---

## Task 11: `PlanActionRow` (disabled "Build with coach" + "Upload plan")

**Files:**

- Create: `src/components/plans/PlanActionRow.tsx`
- Create: `src/components/plans/PlanActionRow.module.scss`

- [ ] **Step 1: SCSS**

`src/components/plans/PlanActionRow.module.scss`:

```scss
.row {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border-subtle);
  margin-bottom: var(--space-4);
}

.btnPrimary,
.btnSecondary {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 500;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: not-allowed;
  opacity: 0.5;
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-surface);
  color: var(--color-fg-secondary);
  position: relative;
}

.btnPrimary {
  background: var(--color-brown);
  color: #fff;
  border-color: var(--color-brown);
}

.icon {
  font-size: 0.9em;
  opacity: 0.85;
}

.comingSoon {
  display: block;
  font-family: var(--font-body);
  font-size: 0.6875rem;
  color: var(--color-fg-tertiary);
  text-align: center;
  margin-top: var(--space-2);
  letter-spacing: 0.04em;
}
```

- [ ] **Step 2: Component**

`src/components/plans/PlanActionRow.tsx`:

```tsx
import styles from "./PlanActionRow.module.scss";

export function PlanActionRow() {
  return (
    <>
      <div className={styles.row} aria-label="Plan actions">
        <button type="button" disabled className={styles.btnPrimary} title="Coming in Phase 4">
          <span className={styles.icon}>✦</span> Build with coach
        </button>
        <button type="button" disabled className={styles.btnSecondary} title="Coming in Phase 6">
          <span className={styles.icon}>↑</span> Upload plan
        </button>
      </div>
      <span className={styles.comingSoon}>Coach &amp; upload coming soon</span>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/plans/PlanActionRow.tsx src/components/plans/PlanActionRow.module.scss
git commit -m "Add disabled PlanActionRow placeholders for coach/upload"
```

---

## Task 12: `PlansEmptyState` component

**Files:**

- Create: `src/components/plans/PlansEmptyState.tsx`
- Create: `src/components/plans/PlansEmptyState.module.scss`

- [ ] **Step 1: SCSS**

`src/components/plans/PlansEmptyState.module.scss`:

```scss
.card {
  background: var(--color-bg-surface);
  border: 1.5px dashed var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--space-8) var(--space-6);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1rem;
  color: var(--color-fg-primary);
  margin: 0;
}

.body {
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: var(--color-fg-secondary);
  max-width: 280px;
}
```

- [ ] **Step 2: Component**

`src/components/plans/PlansEmptyState.tsx`:

```tsx
import styles from "./PlansEmptyState.module.scss";

export function PlansEmptyState() {
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>No plans yet</h2>
      <p className={styles.body}>
        Once the coach is online or upload is wired up, your plans will live here.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/plans/PlansEmptyState.tsx src/components/plans/PlansEmptyState.module.scss
git commit -m "Add PlansEmptyState component"
```

---

## Task 13: `/plans` page (server component) + `PlansPageClient`

**Files:**

- Create: `src/app/(app)/plans/page.tsx`
- Create: `src/app/(app)/plans/PlansPageClient.tsx`
- Create: `src/app/(app)/plans/Plans.module.scss`

- [ ] **Step 1: Page styles**

`src/app/(app)/plans/Plans.module.scss`:

```scss
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
}

.header {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.375rem;
  letter-spacing: -0.02em;
  color: var(--color-fg-primary);
  margin: 0;
}

.archivedLabel {
  font-family: var(--font-body);
  font-size: 0.6875rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-fg-tertiary);
  margin: var(--space-4) 0 var(--space-1);
}

.archivedList {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
```

- [ ] **Step 2: Client component**

`src/app/(app)/plans/PlansPageClient.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import styles from "./Plans.module.scss";
import { ActivePlanCard } from "@/components/plans/ActivePlanCard";
import { ArchivedPlanCard } from "@/components/plans/ArchivedPlanCard";
import { PlanActionRow } from "@/components/plans/PlanActionRow";
import { PlansEmptyState } from "@/components/plans/PlansEmptyState";
import type { PlanWithCounts } from "@/plans/types";

interface Props {
  plans: PlanWithCounts[];
  today: string;
}

async function patchPlan(id: string, body: { is_active: boolean }): Promise<void> {
  const res = await fetch(`/api/plans/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH /api/plans/${id} failed: ${res.status}`);
}

async function deletePlanReq(id: string): Promise<void> {
  const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/plans/${id} failed: ${res.status}`);
}

export function PlansPageClient({ plans, today }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
      refresh();
    } catch (err) {
      console.error(err);
      alert("Action failed — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const active = plans.find((p) => p.is_active) ?? null;
  const archived = plans.filter((p) => !p.is_active);

  return (
    <div className={styles.page}>
      <h1 className={styles.header}>Plans</h1>
      <PlanActionRow />

      {!active && archived.length === 0 && <PlansEmptyState />}

      {active && (
        <ActivePlanCard
          plan={active}
          today={today}
          busy={busyId === active.id}
          onArchive={() => withBusy(active.id, () => patchPlan(active.id, { is_active: false }))}
          onDelete={() => {
            if (!confirm(`Delete "${active.title}"? This cannot be undone.`)) return;
            void withBusy(active.id, () => deletePlanReq(active.id));
          }}
        />
      )}

      {archived.length > 0 && (
        <>
          <div className={styles.archivedLabel}>Archived</div>
          <div className={styles.archivedList}>
            {archived.map((p) => (
              <ArchivedPlanCard
                key={p.id}
                plan={p}
                busy={busyId === p.id}
                onRestore={() => withBusy(p.id, () => patchPlan(p.id, { is_active: true }))}
                onDelete={() => {
                  if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
                  void withBusy(p.id, () => deletePlanReq(p.id));
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Server component**

`src/app/(app)/plans/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listPlansWithCounts } from "@/plans/queries";
import { PlansPageClient } from "./PlansPageClient";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PlansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const today = isoToday();
  const plans = await listPlansWithCounts(session.user.id, today);

  return <PlansPageClient plans={plans} today={today} />;
}
```

- [ ] **Step 4: Run full test suite**

Run: `npm test -- --run`
Expected: all tests passing.

- [ ] **Step 5: Manual check (skip if no dev server access)**

Start: `npm run dev` and visit `http://localhost:3000/plans`

- Empty state shows when there are no plans
- Action row shows two disabled buttons + "coming soon" caption

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/plans/
git commit -m "Add /plans server + client components"
```

---

## Task 14: Apply migration + smoke-seed against the dev DB

**Files:** none (operational only)

This task verifies the migration applies cleanly and the page renders against real data.

- [ ] **Step 1: Apply the migration**

Run: `npm run db:migrate`
Expected: `✓ migrations applied successfully!` and `0002_*.sql` in the journal.

- [ ] **Step 2: Seed a sample plan via the new API**

In a browser logged in as the dev user, open DevTools and run:

```js
await fetch("/api/plans", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Boston Marathon Build",
    sport: "run",
    mode: "goal",
    start_date: "2026-01-12",
    end_date: "2026-05-04",
    goal: { target_time: "3:05", race_date: "2026-05-05", race_distance: "marathon" },
    source: "coach_generated",
  }),
}).then((r) => r.json());
```

Expected: `{ plan: { id, title: "Boston Marathon Build", is_active: false, ... } }`.

- [ ] **Step 3: Activate the plan**

```js
await fetch(`/api/plans/<id-from-step-2>`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ is_active: true }),
});
```

Then refresh `/plans`. Expected: ActivePlanCard renders with the title, brown 2px border, "Active" pill, sport/duration/goal meta, and stats grid (`Workouts: 0`, `Completed: 0`, `Weeks left: <number>`).

- [ ] **Step 4: Verify Archive / Restore / Delete flows**

- Click **Archive** on the active card → card moves to "Archived" list with **Restore** + **Delete**.
- Click **Restore** on an archived card → it becomes the active card.
- Click **Delete** on either → confirm dialog → row disappears after refresh.

- [ ] **Step 5: Verify the partial unique index**

Try to set a second plan active while another is already active — `setActivePlan` should succeed because it's a single UPDATE that flips all rows in one statement. Confirm only one plan has `is_active=true` after the call:

```sql
SELECT id, title, is_active FROM plan WHERE "userId" = '<your-user-id>';
```

Expected: at most one row with `is_active=true`.

- [ ] **Step 6: Done — no commit (operational only)**

---

## Self-review

After all tasks complete:

1. **Spec coverage** — Verify against §6 (`plans` + `workouts` schema), §4 (`/api/plans` routes), §10 / Plans view (manage page list + set-active + archive + delete).
2. **Phase boundary** — Confirm we did NOT build: plan detail view, upload pipeline, coach integration, workout matching, calendar/today rendering. Those belong in 4/5/6.
3. **Driver compatibility** — All multi-row mutations are single statements (no `db.transaction`) since the Neon HTTP driver doesn't support transactions.
4. **Auth + ownership** — Every API route checks both `auth()` and `getPlanById(id, userId)` ownership. No way to mutate another user's plan.
5. **Type consistency** — `Sport`, `PlanMode`, `PlanSource`, `Goal`, `TargetIntensity`, `IntervalSpec` defined once in `src/plans/types.ts` and `src/db/schema.ts` (re-exported), not duplicated.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-26-phase-3-plans-manage.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review (spec → quality), fast iteration.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`.

Which approach?
