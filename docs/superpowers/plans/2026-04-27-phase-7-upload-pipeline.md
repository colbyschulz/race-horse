# Phase 7: Upload Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Branch policy:** Implemented directly on `master` (per user instruction — no feature branch, no worktree).
>
> **Commit policy override:** the user drives all commits. Implementer subagents MUST NOT run `git commit`. Leave changes staged or unstaged at the end of each task and report what's ready.
>
> **Next.js notice (AGENTS.md):** This repo is on Next.js 16. Before writing route handlers / server actions / `params` typing / streaming, verify against `node_modules/next/dist/docs/`. Don't trust pre-16 conventions. Same for the Anthropic SDK — `messages.parse` and structured outputs may have shape differences vs. older docs; check `node_modules/@anthropic-ai/sdk/...` if a call shape feels uncertain.

**Goal:** Users can upload a PDF/CSV/Excel/Markdown training plan on `/plans`, watch it extract via Claude with structured outputs, review and lightly edit the result, then save it as a `plans` + `workouts` row pair. On extraction failure, the coach can read the original file via a new `read_uploaded_file` tool to help build the plan interactively.

**Architecture:** A new `plan_files` table tracks upload lifecycle (`extracting | extracted | failed`) and stages the extracted JSON in `extracted_payload` until the user saves. Six new API routes cover the lifecycle. Workouts are extracted as `day_offset` (0-indexed) so the review-page start-date picker can re-anchor the entire plan client-side without re-extracting. Failure mode hands the file off to the coach via a new tool and a deep-link query param.

**Tech Stack:** Next.js 16 App Router (server + client components), Drizzle ORM (Neon HTTP — no transactions), `@vercel/blob` for storage, `@anthropic-ai/sdk` `messages.parse` with Zod schema for structured outputs, `papaparse` for CSV, `xlsx` (SheetJS) for Excel, SCSS Modules using existing `--color-*` / `--space-*` / `--font-*` tokens. Vitest + @testing-library/react for tests.

**Design source:** `docs/design/project/Race Horse Hi-Fi.html` for the upload zone (dashed border, "↑ Upload a plan" + "PDF, CSV, Excel or Markdown") and Phase 6's `WorkoutDetailSheet` / `PlanStats` / `MileageChart` / `WeekGrid` for the review preview.

**Spec:** `docs/superpowers/specs/2026-04-27-phase-7-upload-pipeline-design.md`

---

## File structure

**Create:**
- `src/db/schema.ts` — extend with `plan_file_status` enum + `planFiles` table.
- `drizzle/000X_<auto>.sql` — generated migration.
- `src/plans/files.ts` — queries: `createPlanFile`, `getPlanFileById`, `listInFlightPlanFiles`, `updatePlanFileStatus`, `setExtractedPayload`, `setExtractedPlanId`, `deletePlanFile`.
- `src/plans/__tests__/files.test.ts`
- `src/plans/materialize.ts` — `materializeWorkouts(startDate, extractedWorkouts) → InsertableWorkout[]`, `computeEndDate(workouts) → string`.
- `src/plans/__tests__/materialize.test.ts`
- `src/extraction/schema.ts` — Zod `ExtractedPlanSchema` + helpers.
- `src/extraction/format.ts` — `formatForClaude(buffer, mime, filename) → ContentBlock[]`.
- `src/extraction/__tests__/format.test.ts`
- `src/extraction/runtime.ts` — `runExtraction(planFileId, userId)` orchestration.
- `src/extraction/__tests__/runtime.test.ts`
- `src/extraction/blob.ts` — `fetchPlanFileBytes(blobUrl) → ArrayBuffer` thin wrapper around Blob fetch.
- `src/app/api/plans/upload/route.ts` — `POST` (multipart upload).
- `src/app/api/plans/upload/[id]/route.ts` — `GET` (status poll), `DELETE` (discard).
- `src/app/api/plans/upload/[id]/extract/route.ts` — `POST`.
- `src/app/api/plans/upload/[id]/save/route.ts` — `POST`.
- `src/app/api/plans/upload/[id]/file/route.ts` — `GET` (authed proxy).
- `src/components/plans/UploadDropzone.tsx` + `.module.scss` + `__tests__/UploadDropzone.test.tsx`
- `src/components/plans/InFlightUploadCard.tsx` + `.module.scss` + `__tests__/InFlightUploadCard.test.tsx`
- `src/app/(app)/plans/upload/[id]/review/page.tsx` — server.
- `src/app/(app)/plans/upload/[id]/review/ReviewClient.tsx` — client switch on status.
- `src/app/(app)/plans/upload/[id]/review/ReviewForm.tsx` — client; the form when status=extracted.
- `src/app/(app)/plans/upload/[id]/review/Review.module.scss`
- `src/app/(app)/plans/upload/[id]/review/__tests__/ReviewForm.test.tsx`
- `src/coach/tools/files.ts` — `read_uploaded_file` tool definition + handler.
- `src/coach/tools/__tests__/files.test.ts`

**Modify:**
- `package.json` / lockfile — add `@vercel/blob`, `papaparse`, `@types/papaparse`, `xlsx`.
- `src/components/plans/PlanActionRow.tsx` — drop disabled state on Upload button (and on "Build with coach" — Phase 4 already shipped).
- `src/components/plans/PlanActionRow.module.scss` — remove `.comingSoon` if it becomes unused; keep otherwise.
- `src/app/(app)/plans/PlansPageClient.tsx` — render the in-flight uploads section above the active plan card; pass `planFiles` from the server.
- `src/app/(app)/plans/page.tsx` — fetch `planFiles` and pass to client.
- `src/coach/types.ts` — add `"read_uploaded_file"` to `ToolName` union.
- `src/coach/tools/index.ts` — register `read_uploaded_file` tool + handler + summarizer case.
- `src/coach/context.ts` — `renderContextPrefix` accepts an optional `planFile` param and renders the file-help block. `routeLabel` is unchanged.
- `src/coach/runner.ts` — read `plan_file_id` from `RunInput`, look it up + ownership-check, pass to `renderContextPrefix`.
- `src/coach/types.ts` — extend `ChatRequestBody` with `plan_file_id?: string` and `RunInput` similarly.
- `src/app/api/coach/chat/route.ts` — read `plan_file_id` from body, forward to `runCoach`.
- `src/coach/systemPrompt.ts` — add the one-line `read_uploaded_file` description.
- `src/components/coach/*` (whichever sends `from_route`) — accept and forward `plan_file_id` query param.
- `src/coach/__tests__/context.test.ts` — extend tests for the planFile branch.

**No changes needed:**
- `plans.source_file_id` already exists; the save handler populates it.
- Phase 6 components (`PlanStats`, `MileageChart`, `WeekGrid`, `WorkoutDetailSheet`) are reused as-is.

---

## Task 1: Dependencies + Vercel Blob env

**Files:**
- Modify: `package.json` (and lockfile via npm install)

- [ ] **Step 1: Install runtime deps**

```bash
npm install @vercel/blob papaparse xlsx
```

- [ ] **Step 2: Install dev deps**

```bash
npm install --save-dev @types/papaparse
```

- [ ] **Step 3: Verify versions**

Run:
```bash
npx tsc --noEmit
```

If `xlsx` types aren't found, add `// @ts-expect-error xlsx has no shipped types` ONLY at the actual import site (not eagerly here). SheetJS bundles its own types in some versions; check the actual error before adding suppressions.

- [ ] **Step 4: Document `BLOB_READ_WRITE_TOKEN`**

Add a one-liner reminder to `README.md` under the existing env section (find the section that lists `DATABASE_URL` / `ANTHROPIC_API_KEY`):

```
BLOB_READ_WRITE_TOKEN  # Vercel Blob token; pull via `vercel env pull` or set manually for local dev.
```

If `README.md` has no env section, skip — env is documented elsewhere.

- [ ] **Step 5: Stage everything**

Leave `package.json`, the lockfile, and any README change unstaged. Do not commit.

---

## Task 2: Schema migration — `plan_files` + `plan_file_status` enum

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/000X_*.sql` (auto-generated)

- [ ] **Step 1: Add the enum**

In `src/db/schema.ts`, near the other `pgEnum` declarations (line 34 area), add:

```ts
export const planFileStatusEnum = pgEnum("plan_file_status", [
  "extracting",
  "extracted",
  "failed",
]);
```

- [ ] **Step 2: Add the table**

Append to `src/db/schema.ts` after the `messages` table:

```ts
export const planFiles = pgTable(
  "plan_file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blob_url: text("blob_url").notNull(),
    original_filename: text("original_filename").notNull(),
    mime_type: text("mime_type").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    status: planFileStatusEnum("status").notNull(),
    extraction_error: text("extraction_error"),
    extracted_payload: jsonb("extracted_payload"),
    extracted_plan_id: uuid("extracted_plan_id").references(() => plans.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("plan_file_user_idx").on(t.userId, t.created_at),
  ],
);
```

- [ ] **Step 3: Generate migration**

```bash
npm run db:generate
```

Review the generated SQL file under `drizzle/`. It should `CREATE TYPE plan_file_status` and `CREATE TABLE plan_file` with the FK references. If the generated file looks wrong (e.g., wraps both halves into a single ALTER), regenerate and don't apply.

- [ ] **Step 4: Apply migration locally**

```bash
npm run db:migrate
```

(Or `db:push` if that's what the existing dev workflow uses — check the recent commits for which command was used in earlier phases. `db:migrate` is preferred for repeatable schema state.)

- [ ] **Step 5: Verify types compile**

```bash
npx tsc --noEmit
```

Stage `src/db/schema.ts` + the new `drizzle/0005_*.sql` (or whatever the next number is) + `drizzle/meta/*.json` updates. Do not commit.

---

## Task 3: `src/plans/files.ts` queries

**Files:**
- Create: `src/plans/files.ts`
- Create: `src/plans/__tests__/files.test.ts`

- [ ] **Step 1: Failing tests**

Use the existing `src/plans/__tests__/queries.test.ts` mocking pattern verbatim — same `fromChain` / `selectChain` / `insertChain` / `updateChain` / `deleteChain` shape, same `vi.mock("@/db", …)` and `vi.mock("@/db/schema", …)`.

```ts
// src/plans/__tests__/files.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fromChain = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
};
const selectChain = { from: vi.fn(() => fromChain) };
const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn() };
const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };

vi.mock("@/db", () => ({
  db: {
    select: () => selectChain,
    insert: () => insertChain,
    update: () => updateChain,
    delete: () => deleteChain,
  },
}));
vi.mock("@/db/schema", () => ({
  planFiles: {
    id: "id",
    userId: "userId",
    status: "status",
    extracted_plan_id: "extracted_plan_id",
    created_at: "created_at",
  },
}));

import {
  createPlanFile,
  getPlanFileById,
  listInFlightPlanFiles,
  updatePlanFileStatus,
  setExtractedPayload,
  setExtractedPlanId,
  deletePlanFile,
} from "../files";

describe("createPlanFile", () => {
  beforeEach(() => {
    insertChain.values.mockClear().mockReturnThis();
    insertChain.returning.mockClear();
  });
  it("inserts a row with the provided id and returns it", async () => {
    const row = { id: "f1", userId: "u1", status: "extracting" };
    insertChain.returning.mockResolvedValueOnce([row]);
    const result = await createPlanFile({
      id: "f1",
      userId: "u1",
      blob_url: "https://blob/x",
      original_filename: "plan.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
    });
    expect(result).toEqual(row);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: "f1", userId: "u1", status: "extracting" }),
    );
  });
});

describe("getPlanFileById", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.limit.mockClear();
  });
  it("returns null when not found", async () => {
    fromChain.limit.mockResolvedValueOnce([]);
    expect(await getPlanFileById("f1", "u1")).toBeNull();
  });
  it("returns the row when found", async () => {
    const row = { id: "f1", userId: "u1" };
    fromChain.limit.mockResolvedValueOnce([row]);
    expect(await getPlanFileById("f1", "u1")).toEqual(row);
  });
});

describe("listInFlightPlanFiles", () => {
  beforeEach(() => {
    fromChain.where.mockClear().mockReturnThis();
    fromChain.orderBy.mockClear();
  });
  it("returns rows where extracted_plan_id IS NULL, newest first", async () => {
    const rows = [{ id: "f2" }, { id: "f1" }];
    fromChain.orderBy.mockResolvedValueOnce(rows);
    expect(await listInFlightPlanFiles("u1")).toEqual(rows);
  });
});

describe("updatePlanFileStatus", () => {
  beforeEach(() => {
    updateChain.set.mockClear().mockReturnThis();
    updateChain.where.mockClear().mockResolvedValue(undefined);
  });
  it("updates status + optional error", async () => {
    await updatePlanFileStatus("f1", "u1", "failed", "boom");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", extraction_error: "boom" }),
    );
  });
});

describe("setExtractedPayload", () => {
  it("writes payload + status=extracted", async () => {
    await setExtractedPayload("f1", "u1", { is_training_plan: true });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "extracted", extracted_payload: { is_training_plan: true } }),
    );
  });
});

describe("setExtractedPlanId", () => {
  it("links plan id", async () => {
    await setExtractedPlanId("f1", "u1", "p1");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ extracted_plan_id: "p1" }),
    );
  });
});

describe("deletePlanFile", () => {
  it("deletes scoped to user", async () => {
    await deletePlanFile("f1", "u1");
    expect(deleteChain.where).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run src/plans/__tests__/files.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/plans/files.ts
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { planFiles } from "@/db/schema";

export type PlanFileRow = {
  id: string;
  userId: string;
  blob_url: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: "extracting" | "extracted" | "failed";
  extraction_error: string | null;
  extracted_payload: unknown | null;
  extracted_plan_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CreatePlanFileInput = {
  id: string;
  userId: string;
  blob_url: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
};

export async function createPlanFile(input: CreatePlanFileInput): Promise<PlanFileRow> {
  const result = await db
    .insert(planFiles)
    .values({
      id: input.id,
      userId: input.userId,
      blob_url: input.blob_url,
      original_filename: input.original_filename,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      status: "extracting",
      updated_at: new Date(),
    })
    .returning();
  if (!result[0]) throw new Error("createPlanFile: no row returned");
  return result[0] as PlanFileRow;
}

export async function getPlanFileById(id: string, userId: string): Promise<PlanFileRow | null> {
  const rows = await db
    .select()
    .from(planFiles)
    .where(and(eq(planFiles.id, id), eq(planFiles.userId, userId)))
    .limit(1);
  return (rows[0] as PlanFileRow | undefined) ?? null;
}

export async function listInFlightPlanFiles(userId: string): Promise<PlanFileRow[]> {
  return db
    .select()
    .from(planFiles)
    .where(and(eq(planFiles.userId, userId), isNull(planFiles.extracted_plan_id)))
    .orderBy(desc(planFiles.created_at)) as Promise<PlanFileRow[]>;
}

export async function updatePlanFileStatus(
  id: string,
  userId: string,
  status: "extracting" | "extracted" | "failed",
  error?: string | null,
): Promise<void> {
  await db
    .update(planFiles)
    .set({
      status,
      extraction_error: error == null ? null : error.slice(0, 1024),
      updated_at: new Date(),
    })
    .where(and(eq(planFiles.id, id), eq(planFiles.userId, userId)));
}

export async function setExtractedPayload(
  id: string,
  userId: string,
  payload: unknown,
): Promise<void> {
  await db
    .update(planFiles)
    .set({
      status: "extracted",
      extracted_payload: payload as never,
      extraction_error: null,
      updated_at: new Date(),
    })
    .where(and(eq(planFiles.id, id), eq(planFiles.userId, userId)));
}

export async function setExtractedPlanId(
  id: string,
  userId: string,
  planId: string,
): Promise<void> {
  await db
    .update(planFiles)
    .set({ extracted_plan_id: planId, updated_at: new Date() })
    .where(and(eq(planFiles.id, id), eq(planFiles.userId, userId)));
}

export async function deletePlanFile(id: string, userId: string): Promise<void> {
  await db
    .delete(planFiles)
    .where(and(eq(planFiles.id, id), eq(planFiles.userId, userId)));
}

// Reference imports kept to silence lints if any helper above goes unused initially.
void sql;
```

Remove the `void sql;` line if `sql` is unused. (Drop `sql` from the import if so.)

- [ ] **Step 4: Run, expect pass**

```bash
npx vitest run src/plans/__tests__/files.test.ts
npx tsc --noEmit
```

Stage. Do not commit.

---

## Task 4: Workout materialization util

**Files:**
- Create: `src/plans/materialize.ts`
- Create: `src/plans/__tests__/materialize.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// src/plans/__tests__/materialize.test.ts
import { describe, it, expect } from "vitest";
import { materializeWorkouts, computeEndDate } from "../materialize";

const wk = (day_offset: number, distance_meters: number | null = 5000) => ({
  day_offset,
  sport: "run" as const,
  type: "easy" as const,
  distance_meters,
  duration_seconds: null,
  target_intensity: null,
  intervals: null,
  notes: "",
});

describe("materializeWorkouts", () => {
  it("computes absolute dates from start_date + day_offset", () => {
    const result = materializeWorkouts("2026-05-04", [wk(0), wk(1), wk(7)]);
    expect(result.map((r) => r.date)).toEqual(["2026-05-04", "2026-05-05", "2026-05-11"]);
  });
  it("preserves null distance + populates other fields", () => {
    const [r] = materializeWorkouts("2026-05-04", [wk(0, null)]);
    expect(r.distance_meters).toBeNull();
    expect(r.sport).toBe("run");
    expect(r.type).toBe("easy");
  });
  it("handles empty array", () => {
    expect(materializeWorkouts("2026-05-04", [])).toEqual([]);
  });
});

describe("computeEndDate", () => {
  it("returns max date among materialized workouts", () => {
    const ws = materializeWorkouts("2026-05-04", [wk(0), wk(13), wk(7)]);
    expect(computeEndDate(ws)).toBe("2026-05-17");
  });
  it("returns the start date for a single workout", () => {
    const ws = materializeWorkouts("2026-05-04", [wk(0)]);
    expect(computeEndDate(ws)).toBe("2026-05-04");
  });
  it("throws on empty input (caller must check)", () => {
    expect(() => computeEndDate([])).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run src/plans/__tests__/materialize.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/plans/materialize.ts
import { addDays } from "@/lib/dates";
import type { TargetIntensity, IntervalSpec } from "@/db/schema";
import type { Sport } from "./types";

export type ExtractedWorkout = {
  day_offset: number;
  sport: Sport;
  type:
    | "easy" | "long" | "tempo" | "threshold"
    | "intervals" | "recovery" | "race" | "rest" | "cross";
  distance_meters: number | null;
  duration_seconds: number | null;
  target_intensity: TargetIntensity | null;
  intervals: IntervalSpec[] | null;
  notes: string;
};

export type MaterializedWorkout = Omit<ExtractedWorkout, "day_offset"> & {
  date: string; // YYYY-MM-DD
};

export function materializeWorkouts(
  startDate: string,
  workouts: ExtractedWorkout[],
): MaterializedWorkout[] {
  return workouts.map((w) => {
    const { day_offset, ...rest } = w;
    return { ...rest, date: addDays(startDate, day_offset) };
  });
}

export function computeEndDate(workouts: MaterializedWorkout[]): string {
  if (workouts.length === 0) {
    throw new Error("computeEndDate: empty workouts array");
  }
  return workouts.reduce((max, w) => (w.date > max ? w.date : max), workouts[0].date);
}
```

- [ ] **Step 4: Run, expect pass + tsc**

```bash
npx vitest run src/plans/__tests__/materialize.test.ts
npx tsc --noEmit
```

Stage.

---

## Task 5: Extraction Zod schema

**Files:**
- Create: `src/extraction/schema.ts`

- [ ] **Step 1: Implement**

```ts
// src/extraction/schema.ts
import { z } from "zod";

const TargetIntensityZ = z.object({
  pace: z.object({
    min_seconds_per_km: z.number().optional(),
    max_seconds_per_km: z.number().optional(),
  }).optional(),
  power: z.object({
    min_watts: z.number().optional(),
    max_watts: z.number().optional(),
  }).optional(),
  hr: z.union([
    z.object({ min_bpm: z.number().optional(), max_bpm: z.number().optional() }),
    z.object({ zone: z.string() }),
  ]).optional(),
  rpe: z.number().optional(),
});

const IntervalSpecZ = z.object({
  reps: z.number().int().positive(),
  distance_m: z.number().optional(),
  duration_s: z.number().optional(),
  target_intensity: TargetIntensityZ.optional(),
  rest: z.object({
    duration_s: z.number().optional(),
    distance_m: z.number().optional(),
  }).optional(),
});

const WorkoutTypeZ = z.enum([
  "easy", "long", "tempo", "threshold",
  "intervals", "recovery", "race", "rest", "cross",
]);

export const ExtractedPlanSchema = z.object({
  is_training_plan: z.boolean(),
  title: z.string(),
  sport: z.enum(["run", "bike"]),
  mode: z.enum(["goal", "indefinite"]),
  goal: z.object({
    race_date: z.string().nullable(),
    race_distance: z.string().nullable(),
    target_time: z.string().nullable(),
  }).nullable(),
  tentative_start_date: z.string().nullable(),
  workouts: z.array(z.object({
    day_offset: z.number().int().nonnegative(),
    sport: z.enum(["run", "bike"]),
    type: WorkoutTypeZ,
    distance_meters: z.number().nullable(),
    duration_seconds: z.number().int().nullable(),
    target_intensity: TargetIntensityZ.nullable(),
    intervals: z.array(IntervalSpecZ).nullable(),
    notes: z.string(),
  })),
});

export type ExtractedPlan = z.infer<typeof ExtractedPlanSchema>;
```

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit
```

Stage. (No tests yet — covered by `runtime.test.ts` in Task 7.)

---

## Task 6: Extraction file formatting

**Files:**
- Create: `src/extraction/format.ts`
- Create: `src/extraction/__tests__/format.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// src/extraction/__tests__/format.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("papaparse", () => ({
  default: { parse: vi.fn() },
}));
vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: { sheet_to_json: vi.fn() },
}));

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { formatForClaude } from "../format";

describe("formatForClaude", () => {
  it("PDF → document block (base64) + text block with filename", async () => {
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer; // "%PDF" header
    const blocks = await formatForClaude(buf, "application/pdf", "plan.pdf");
    expect(blocks).toHaveLength(3); // document, filename text, instruction text
    expect(blocks[0]).toMatchObject({
      type: "document",
      source: { type: "base64", media_type: "application/pdf" },
    });
    const textBlocks = blocks.filter((b) => b.type === "text") as Array<{ type: "text"; text: string }>;
    expect(textBlocks[0].text).toContain("plan.pdf");
  });

  it("CSV → text block with parsed rows", async () => {
    const csv = "date,type,distance\n2026-05-04,easy,5000\n";
    const buf = new TextEncoder().encode(csv).buffer;
    (Papa.parse as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ date: "2026-05-04", type: "easy", distance: "5000" }],
    });
    const blocks = await formatForClaude(buf, "text/csv", "plan.csv");
    expect(blocks[0]).toMatchObject({ type: "text" });
    const t = blocks[0] as { type: "text"; text: string };
    expect(t.text).toContain("plan.csv");
    expect(t.text).toContain("2026-05-04");
  });

  it("XLSX → text block with rows per sheet", async () => {
    const buf = new ArrayBuffer(8);
    (XLSX.read as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      SheetNames: ["S1"],
      Sheets: { S1: {} },
    });
    (XLSX.utils.sheet_to_json as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { day: 1, type: "easy" },
    ]);
    const blocks = await formatForClaude(
      buf,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "plan.xlsx",
    );
    const t = blocks[0] as { type: "text"; text: string };
    expect(t.text).toContain("S1");
    expect(t.text).toContain("easy");
  });

  it("Markdown / text → text block as-is", async () => {
    const md = "# Plan\nWeek 1, Day 1: Easy 5k";
    const buf = new TextEncoder().encode(md).buffer;
    const blocks = await formatForClaude(buf, "text/markdown", "plan.md");
    const t = blocks[0] as { type: "text"; text: string };
    expect(t.text).toContain("# Plan");
    expect(t.text).toContain("plan.md");
  });

  it("rejects unsupported mime", async () => {
    const buf = new ArrayBuffer(8);
    await expect(formatForClaude(buf, "image/png", "plan.png")).rejects.toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run src/extraction/__tests__/format.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/extraction/format.ts
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Anthropic } from "@anthropic-ai/sdk";

type ContentBlock = Anthropic.Messages.ContentBlockParam;

const EXTRACTION_INSTRUCTION =
  "Extract the training plan above into the structured schema. " +
  "Express each workout's date as `day_offset` (0-indexed integer) from the plan's start. " +
  "If the file gives an explicit start date, set `tentative_start_date`; otherwise leave it null. " +
  "If this isn't a training plan, set `is_training_plan: false` and leave the rest as empty defaults.";

function bufferToBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}

function bufferToText(buf: ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(buf);
}

export async function formatForClaude(
  buf: ArrayBuffer,
  mime: string,
  filename: string,
): Promise<ContentBlock[]> {
  if (mime === "application/pdf") {
    return [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: bufferToBase64(buf),
        },
      },
      { type: "text", text: `Filename: ${filename}` },
      { type: "text", text: EXTRACTION_INSTRUCTION },
    ];
  }

  if (mime === "text/csv") {
    const text = bufferToText(buf);
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = (parsed as { data: unknown[] }).data;
    return [
      {
        type: "text",
        text: `Filename: ${filename}\n\nCSV rows (${rows.length}):\n${JSON.stringify(rows, null, 2)}\n\n${EXTRACTION_INSTRUCTION}`,
      },
    ];
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  ) {
    const wb = XLSX.read(buf, { type: "array" });
    const parts: string[] = [`Filename: ${filename}`, ""];
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name]);
      parts.push(`Sheet: ${name}`);
      parts.push(JSON.stringify(rows, null, 2));
      parts.push("");
    }
    parts.push(EXTRACTION_INSTRUCTION);
    return [{ type: "text", text: parts.join("\n") }];
  }

  if (mime === "text/markdown" || mime === "text/plain") {
    const text = bufferToText(buf);
    return [
      { type: "text", text: `Filename: ${filename}\n\n${text}\n\n${EXTRACTION_INSTRUCTION}` },
    ];
  }

  throw new Error(`unsupported mime type: ${mime}`);
}
```

- [ ] **Step 4: Run, expect pass + tsc**

```bash
npx vitest run src/extraction/__tests__/format.test.ts
npx tsc --noEmit
```

Stage.

---

## Task 7: Extraction runtime + Anthropic call

**Files:**
- Create: `src/extraction/blob.ts`
- Create: `src/extraction/runtime.ts`
- Create: `src/extraction/__tests__/runtime.test.ts`

- [ ] **Step 1: Blob fetch helper**

```ts
// src/extraction/blob.ts
export async function fetchPlanFileBytes(blobUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(blobUrl);
  if (!res.ok) {
    throw new Error(`fetchPlanFileBytes: ${res.status} ${res.statusText}`);
  }
  return res.arrayBuffer();
}
```

- [ ] **Step 2: Failing tests**

```ts
// src/extraction/__tests__/runtime.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getPlanFileById = vi.fn();
const updatePlanFileStatus = vi.fn();
const setExtractedPayload = vi.fn();
const fetchPlanFileBytes = vi.fn();
const formatForClaude = vi.fn();
const messagesParse = vi.fn();
const getAnthropic = vi.fn(() => ({
  messages: { parse: messagesParse },
}));

vi.mock("@/plans/files", () => ({
  getPlanFileById,
  updatePlanFileStatus,
  setExtractedPayload,
}));
vi.mock("../blob", () => ({ fetchPlanFileBytes }));
vi.mock("../format", () => ({ formatForClaude }));
vi.mock("@/coach/anthropic", () => ({
  getAnthropic,
  COACH_MODEL: "claude-opus-4-7",
}));

import { runExtraction } from "../runtime";

const validPayload = {
  is_training_plan: true,
  title: "Test Plan",
  sport: "run",
  mode: "goal",
  goal: { race_date: null, race_distance: null, target_time: null },
  tentative_start_date: null,
  workouts: [
    {
      day_offset: 0,
      sport: "run",
      type: "easy",
      distance_meters: 5000,
      duration_seconds: null,
      target_intensity: null,
      intervals: null,
      notes: "",
    },
  ],
};

describe("runExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPlanFileById.mockResolvedValue({
      id: "f1", userId: "u1", status: "extracting",
      blob_url: "https://blob/x", original_filename: "plan.pdf", mime_type: "application/pdf",
    });
    fetchPlanFileBytes.mockResolvedValue(new ArrayBuffer(8));
    formatForClaude.mockResolvedValue([{ type: "text", text: "x" }]);
  });

  it("writes extracted_payload on success", async () => {
    messagesParse.mockResolvedValue({ output: validPayload });
    await runExtraction("f1", "u1");
    expect(setExtractedPayload).toHaveBeenCalledWith("f1", "u1", validPayload);
  });

  it("marks failed when is_training_plan=false", async () => {
    messagesParse.mockResolvedValue({ output: { ...validPayload, is_training_plan: false } });
    await runExtraction("f1", "u1");
    expect(updatePlanFileStatus).toHaveBeenCalledWith(
      "f1", "u1", "failed", expect.stringMatching(/training plan/i),
    );
  });

  it("marks failed on Anthropic error", async () => {
    messagesParse.mockRejectedValue(new Error("network"));
    await runExtraction("f1", "u1");
    expect(updatePlanFileStatus).toHaveBeenCalledWith(
      "f1", "u1", "failed", expect.stringContaining("network"),
    );
  });

  it("marks failed on schema mismatch", async () => {
    messagesParse.mockResolvedValue({ output: { is_training_plan: true /* missing fields */ } });
    await runExtraction("f1", "u1");
    expect(updatePlanFileStatus).toHaveBeenCalledWith(
      "f1", "u1", "failed", expect.any(String),
    );
  });

  it("returns silently if row is missing or already terminal", async () => {
    getPlanFileById.mockResolvedValueOnce(null);
    await runExtraction("f1", "u1");
    expect(messagesParse).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, expect failure**

```bash
npx vitest run src/extraction/__tests__/runtime.test.ts
```

- [ ] **Step 4: Implement**

```ts
// src/extraction/runtime.ts
import { getAnthropic, COACH_MODEL } from "@/coach/anthropic";
import {
  getPlanFileById,
  setExtractedPayload,
  updatePlanFileStatus,
} from "@/plans/files";
import { fetchPlanFileBytes } from "./blob";
import { formatForClaude } from "./format";
import { ExtractedPlanSchema } from "./schema";

const EXTRACTION_SYSTEM_PROMPT = `You are a training-plan extractor.
Output a JSON object matching the provided schema. Do not invent dates.

Conventions:
- Express each workout's date as \`day_offset\` (0-indexed integer) from the plan's start.
- If the file uses absolute dates, calculate offsets from the earliest workout's date.
- If the file uses "Week N, Day M" notation, day_offset = (N-1)*7 + (M-1) where Day 1 = Monday.
- "tentative_start_date": YYYY-MM-DD if the file gave an explicit start (or earliest absolute workout date); otherwise null.
- Workout types: easy, long, tempo, threshold, intervals, recovery, race, rest, cross.
- target_intensity may include any of: pace (min/max seconds_per_km), power (min/max watts), hr (min/max bpm or {zone}), rpe (1-10).
- If this isn't a training plan, set is_training_plan: false and leave the rest as empty defaults: title="", sport="run", mode="indefinite", goal=null, tentative_start_date=null, workouts=[].`;

export async function runExtraction(planFileId: string, userId: string): Promise<void> {
  const row = await getPlanFileById(planFileId, userId);
  if (!row || row.status !== "extracting") return;

  try {
    const buf = await fetchPlanFileBytes(row.blob_url);
    const content = await formatForClaude(buf, row.mime_type, row.original_filename);

    const client = getAnthropic();
    const response = await client.messages.parse({
      model: COACH_MODEL,
      max_tokens: 8192,
      system: [{ type: "text", text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      schema: ExtractedPlanSchema,
      messages: [{ role: "user", content }],
    } as never); // SDK shape — verify against node_modules/@anthropic-ai/sdk for exact `parse` signature.

    const output = (response as { output: unknown }).output;
    const parsed = ExtractedPlanSchema.safeParse(output);
    if (!parsed.success) {
      await updatePlanFileStatus(
        planFileId, userId, "failed",
        "Couldn't parse the file's structure.",
      );
      return;
    }

    if (!parsed.data.is_training_plan) {
      await updatePlanFileStatus(
        planFileId, userId, "failed",
        "This file doesn't look like a training plan.",
      );
      return;
    }

    await setExtractedPayload(planFileId, userId, parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updatePlanFileStatus(planFileId, userId, "failed", msg);
  }
}
```

**Important:** The Anthropic SDK's `messages.parse` shape may differ from the cast above. Before treating as final, open `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` and the README to find the actual signature for structured outputs (it may be `messages.parse({ schema, ... })` or `messages.create({ output_format: { schema, ... } })` depending on version). Adapt the call to match — but keep the failure semantics identical: schema mismatch → failed; thrown → failed; `is_training_plan === false` → failed.

- [ ] **Step 5: Run, expect pass + tsc**

```bash
npx vitest run src/extraction/__tests__/runtime.test.ts
npx tsc --noEmit
```

If `tsc` complains about the SDK call shape, fix it now using the real types — don't paper over with `as never`. Update the test if the signature changes.

Stage.

---

## Task 8: Upload route — `POST /api/plans/upload`

**Files:**
- Create: `src/app/api/plans/upload/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/plans/upload/route.ts
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { auth } from "@/auth";
import { createPlanFile } from "@/plans/files";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown",
  txt: "text/plain",
};

function unauthorized() { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

function extFromName(name: string): string | null {
  const i = name.lastIndexOf(".");
  if (i < 0) return null;
  return name.slice(i + 1).toLowerCase();
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 10 MB)" }, { status: 400 });
  }
  const ext = extFromName(file.name);
  if (!ext || !(ext in ALLOWED)) {
    return NextResponse.json({ error: "unsupported file type" }, { status: 400 });
  }
  const mime = ALLOWED[ext];

  const id = crypto.randomUUID();
  const blobPath = `plan-files/${id}/${file.name}`;
  let blobUrl: string;
  try {
    const blob = await put(blobPath, file, {
      access: "public", // Vercel Blob "public" still requires the URL to be known; we don't expose the URL anywhere.
      contentType: mime,
    });
    blobUrl = blob.url;
  } catch (err) {
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }

  try {
    await createPlanFile({
      id,
      userId: session.user.id,
      blob_url: blobUrl,
      original_filename: file.name,
      mime_type: mime,
      size_bytes: file.size,
    });
  } catch (err) {
    // Best-effort blob cleanup so we don't leak.
    try { await del(blobUrl); } catch { /* swallow */ }
    return NextResponse.json({ error: "could not record upload" }, { status: 500 });
  }

  return NextResponse.json({ id }, { status: 201 });
}
```

**Note on Vercel Blob access:** Vercel Blob v1+ deprecated `access: "private"` in some configurations. If `access: "public"` is the only option in the installed version, the design's "private blob" property is enforced by **never exposing `blob_url` to the client** — the file proxy route in Task 13 reads it server-side only. Verify the SDK version's `put` signature in `node_modules/@vercel/blob/...` and adjust if the option name differs.

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit
```

No tests for this route in this task — covered by smoke testing in Task 16 + the unit-tested `createPlanFile`. Stage.

---

## Task 9: Status + discard routes — `GET / DELETE /api/plans/upload/[id]`

**Files:**
- Create: `src/app/api/plans/upload/[id]/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/plans/upload/[id]/route.ts
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { auth } from "@/auth";
import { deletePlanFile, getPlanFileById } from "@/plans/files";

type Ctx = { params: Promise<{ id: string }> };

function unauthorized() { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
function notFound() { return NextResponse.json({ error: "not found" }, { status: 404 }); }

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, session.user.id);
  if (!row) return notFound();
  return NextResponse.json({
    id: row.id,
    status: row.status,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    extraction_error: row.extraction_error,
    extracted_payload: row.extracted_payload,
    extracted_plan_id: row.extracted_plan_id,
    created_at: row.created_at,
  });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, session.user.id);
  if (!row) return notFound();

  try { await del(row.blob_url); } catch { /* swallow — keep going to delete the row */ }
  await deletePlanFile(id, session.user.id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit
```

Stage.

---

## Task 10: Extract route — `POST /api/plans/upload/[id]/extract`

**Files:**
- Create: `src/app/api/plans/upload/[id]/extract/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/plans/upload/[id]/extract/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runExtraction } from "@/extraction/runtime";
import { getPlanFileById } from "@/plans/files";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

function unauthorized() { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
function notFound() { return NextResponse.json({ error: "not found" }, { status: 404 }); }

export async function POST(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, session.user.id);
  if (!row) return notFound();
  if (row.status !== "extracting") {
    return NextResponse.json({ error: "not in extracting state" }, { status: 409 });
  }

  await runExtraction(id, session.user.id);

  const final = await getPlanFileById(id, session.user.id);
  if (!final) return notFound();
  return NextResponse.json({
    id: final.id,
    status: final.status,
    extraction_error: final.extraction_error,
  });
}
```

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit
```

Stage.

---

## Task 11: Save route — `POST /api/plans/upload/[id]/save`

**Files:**
- Create: `src/app/api/plans/upload/[id]/save/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/plans/upload/[id]/save/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workouts } from "@/db/schema";
import { auth } from "@/auth";
import {
  getPlanFileById,
  setExtractedPlanId,
} from "@/plans/files";
import {
  createPlan,
  deletePlan,
  setActivePlan,
} from "@/plans/queries";
import {
  materializeWorkouts,
  computeEndDate,
  type ExtractedWorkout,
} from "@/plans/materialize";
import { ExtractedPlanSchema } from "@/extraction/schema";
import type { Sport, PlanMode, Goal } from "@/plans/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
type Ctx = { params: Promise<{ id: string }> };

function unauthorized() { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
function notFound() { return NextResponse.json({ error: "not found" }, { status: 404 }); }
function badRequest(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }); }

type SaveBody = {
  title: string;
  sport: Sport;
  mode: PlanMode;
  goal?: Goal | null;
  start_date: string;
  set_active: boolean;
};

function validate(body: unknown): SaveBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return null;
  if (b.sport !== "run" && b.sport !== "bike") return null;
  if (b.mode !== "goal" && b.mode !== "indefinite") return null;
  if (typeof b.start_date !== "string" || !ISO_DATE.test(b.start_date)) return null;
  if (typeof b.set_active !== "boolean") return null;
  return {
    title: b.title.trim(),
    sport: b.sport,
    mode: b.mode,
    goal: (b.goal as Goal | null | undefined) ?? null,
    start_date: b.start_date,
    set_active: b.set_active,
  };
}

export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;
  const { id } = await ctx.params;

  const file = await getPlanFileById(id, userId);
  if (!file) return notFound();
  if (file.status !== "extracted") return badRequest("not ready");
  if (file.extracted_plan_id) return badRequest("already saved");

  const parsed = ExtractedPlanSchema.safeParse(file.extracted_payload);
  if (!parsed.success) return badRequest("payload corrupt");

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("invalid JSON"); }
  const input = validate(body);
  if (!input) return badRequest("invalid body");

  const materialized = materializeWorkouts(
    input.start_date,
    parsed.data.workouts as ExtractedWorkout[],
  );
  const endDate =
    input.mode === "indefinite" || materialized.length === 0
      ? null
      : computeEndDate(materialized);

  // 1. Insert plan (always inactive at first; we activate in step 4 if requested).
  const plan = await createPlan(userId, {
    title: input.title,
    sport: input.sport,
    mode: input.mode,
    goal: input.goal ?? undefined,
    start_date: input.start_date,
    end_date: endDate,
    source: "uploaded",
    source_file_id: file.id,
  });

  // 2. Insert workouts.
  if (materialized.length > 0) {
    try {
      await db.insert(workouts).values(
        materialized.map((w) => ({
          plan_id: plan.id,
          date: w.date,
          sport: w.sport,
          type: w.type,
          distance_meters: w.distance_meters == null ? null : String(w.distance_meters),
          duration_seconds: w.duration_seconds,
          target_intensity: w.target_intensity,
          intervals: w.intervals,
          notes: w.notes,
        })),
      );
    } catch (err) {
      // Best-effort rollback: delete the plan we just inserted.
      try { await deletePlan(plan.id, userId); } catch { /* swallow */ }
      throw err;
    }
  }

  // 3. Link file → plan.
  await setExtractedPlanId(file.id, userId, plan.id);

  // 4. Activate if requested (deactivates other active plans).
  if (input.set_active) {
    await setActivePlan(plan.id, userId);
  }

  return NextResponse.json({ plan_id: plan.id }, { status: 201 });
}
```

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit
```

Stage.

---

## Task 12: File proxy — `GET /api/plans/upload/[id]/file`

**Files:**
- Create: `src/app/api/plans/upload/[id]/file/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/plans/upload/[id]/file/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPlanFileById } from "@/plans/files";

type Ctx = { params: Promise<{ id: string }> };

function unauthorized() { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
function notFound() { return NextResponse.json({ error: "not found" }, { status: 404 }); }

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse | Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await ctx.params;
  const row = await getPlanFileById(id, session.user.id);
  if (!row) return notFound();

  const upstream = await fetch(row.blob_url);
  if (!upstream.ok) return NextResponse.json({ error: "blob unavailable" }, { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(row.original_filename)}"`,
    },
  });
}
```

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit
```

Stage.

---

## Task 13: `<UploadDropzone />` + wire `PlanActionRow`

**Files:**
- Create: `src/components/plans/UploadDropzone.tsx`
- Create: `src/components/plans/UploadDropzone.module.scss`
- Create: `src/components/plans/__tests__/UploadDropzone.test.tsx`
- Modify: `src/components/plans/PlanActionRow.tsx`
- Modify: `src/app/(app)/plans/PlansPageClient.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/components/plans/__tests__/UploadDropzone.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadDropzone } from "../UploadDropzone";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function makeFile(name: string, size: number, type: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("UploadDropzone", () => {
  it("rejects unsupported file type with inline error", async () => {
    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [makeFile("a.png", 100, "image/png")] });
    fireEvent.change(input);
    expect(await screen.findByText(/unsupported/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversize file", async () => {
    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [makeFile("p.pdf", 11 * 1024 * 1024, "application/pdf")],
    });
    fireEvent.change(input);
    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
  });

  it("on accepted file: POSTs to /api/plans/upload, fires extract, navigates to review", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "f1" }) }) // upload
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });          // extract
    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [makeFile("p.pdf", 100, "application/pdf")] });
    fireEvent.change(input);

    // Wait for the upload POST to resolve and navigation to fire.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledWith("/api/plans/upload", expect.objectContaining({ method: "POST" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(pushMock).toHaveBeenCalledWith("/plans/upload/f1/review");
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run src/components/plans/__tests__/UploadDropzone.test.tsx
```

- [ ] **Step 3: Implement dropzone**

```tsx
// src/components/plans/UploadDropzone.tsx
"use client";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { PlanActionRow } from "./PlanActionRow";
import styles from "./UploadDropzone.module.scss";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set(["pdf", "csv", "xlsx", "md", "txt"]);
const ACCEPT = ".pdf,.csv,.xlsx,.md,.txt";

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  function pickFile() {
    inputRef.current?.click();
  }

  async function handleFile(file: File) {
    setError(null);
    if (!ALLOWED_EXT.has(extOf(file.name))) {
      setError("Unsupported file type. Use PDF, CSV, Excel, Markdown, or text.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File too large (max 10 MB).");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/plans/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Upload failed.");
        setBusy(false);
        return;
      }
      const { id } = (await res.json()) as { id: string };
      // Fire extract; do not await the response — review page polls instead.
      void fetch(`/api/plans/upload/${id}/extract`, { method: "POST" });
      router.push(`/plans/upload/${id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBusy(false);
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setHover(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      className={`${styles.zone} ${hover ? styles.hover : ""}`}
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className={styles.hidden}
        data-testid="upload-input"
        onChange={onChange}
      />
      <PlanActionRow onUpload={pickFile} uploadDisabled={busy} />
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: SCSS**

```scss
// src/components/plans/UploadDropzone.module.scss
.zone {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0;
  border-radius: var(--radius-md);
  transition: background 120ms ease, border-color 120ms ease;
}
.zone.hover {
  background: var(--color-bg-subtle);
  outline: 1.5px dashed var(--color-brown);
  outline-offset: 4px;
}
.hidden { display: none; }
.error {
  font-size: 0.8125rem;
  color: #B83232;
  margin: 0;
}
```

- [ ] **Step 5: Wire `PlanActionRow`**

Replace `src/components/plans/PlanActionRow.tsx` contents:

```tsx
import styles from "./PlanActionRow.module.scss";

interface Props {
  onUpload?: () => void;
  uploadDisabled?: boolean;
}

export function PlanActionRow({ onUpload, uploadDisabled }: Props) {
  return (
    <div className={styles.row} aria-label="Plan actions">
      <a href="/coach?from=/plans" className={styles.btnPrimary}>
        <span className={styles.icon}>✦</span> Build with coach
      </a>
      <button
        type="button"
        disabled={uploadDisabled}
        className={styles.btnSecondary}
        onClick={onUpload}
      >
        <span className={styles.icon}>↑</span> Upload plan
      </button>
    </div>
  );
}
```

If `PlanActionRow.module.scss` defines `.comingSoon`, leave it — it's now unused but harmless (cleanup is out of scope). Same for the `<span className={styles.comingSoon}>` text — we just removed the JSX that used it.

- [ ] **Step 6: Use dropzone in `PlansPageClient`**

In `src/app/(app)/plans/PlansPageClient.tsx`, replace the existing `<PlanActionRow />` import + usage with `<UploadDropzone />`:

```tsx
import { UploadDropzone } from "@/components/plans/UploadDropzone";
// ... and replace `<PlanActionRow />` with `<UploadDropzone />`
```

- [ ] **Step 7: Run tests + tsc**

```bash
npx vitest run src/components/plans/__tests__/UploadDropzone.test.tsx
npx tsc --noEmit
```

Stage.

---

## Task 14: `<InFlightUploadCard />` + in-flight section on `/plans`

**Files:**
- Create: `src/components/plans/InFlightUploadCard.tsx`
- Create: `src/components/plans/InFlightUploadCard.module.scss`
- Create: `src/components/plans/__tests__/InFlightUploadCard.test.tsx`
- Modify: `src/app/(app)/plans/page.tsx`
- Modify: `src/app/(app)/plans/PlansPageClient.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/components/plans/__tests__/InFlightUploadCard.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InFlightUploadCard } from "../InFlightUploadCard";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  global.confirm = vi.fn(() => true) as typeof confirm;
});

const baseRow = {
  id: "f1",
  status: "extracting" as const,
  original_filename: "plan.pdf",
  extraction_error: null as string | null,
};

describe("InFlightUploadCard", () => {
  it("extracting → renders spinner + filename + cancel", () => {
    render(<InFlightUploadCard row={baseRow} />);
    expect(screen.getByText(/Extracting/i)).toBeInTheDocument();
    expect(screen.getByText(/plan.pdf/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("extracted → renders Ready-to-review link", () => {
    render(<InFlightUploadCard row={{ ...baseRow, status: "extracted" }} />);
    const link = screen.getByRole("link", { name: /review/i });
    expect(link).toHaveAttribute("href", "/plans/upload/f1/review");
  });

  it("failed → shows error + Retry/Talk to coach/Discard", () => {
    render(<InFlightUploadCard row={{ ...baseRow, status: "failed", extraction_error: "boom" }} />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    const coachLink = screen.getByRole("link", { name: /coach/i });
    expect(coachLink).toHaveAttribute("href", "/coach?from=/plans&plan_file_id=f1");
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run src/components/plans/__tests__/InFlightUploadCard.test.tsx
```

- [ ] **Step 3: Implement**

```tsx
// src/components/plans/InFlightUploadCard.tsx
"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./InFlightUploadCard.module.scss";

interface Row {
  id: string;
  status: "extracting" | "extracted" | "failed";
  original_filename: string;
  extraction_error: string | null;
}

export function InFlightUploadCard({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function discard() {
    if (!confirm(`Discard "${row.original_filename}"?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/plans/upload/${row.id}`, { method: "DELETE" });
    } finally {
      startTransition(() => router.refresh());
    }
  }

  async function retry() {
    setBusy(true);
    try {
      await fetch(`/api/plans/upload/${row.id}/extract`, { method: "POST" });
    } finally {
      startTransition(() => router.refresh());
    }
  }

  if (row.status === "extracting") {
    return (
      <div className={styles.card}>
        <div className={styles.spinner} aria-hidden="true" />
        <div className={styles.body}>
          <p className={styles.title}>Extracting your plan…</p>
          <p className={styles.sub}>{row.original_filename}</p>
        </div>
        <button type="button" className={styles.btnGhost} disabled={busy || pending} onClick={discard}>
          Cancel
        </button>
      </div>
    );
  }

  if (row.status === "extracted") {
    return (
      <Link href={`/plans/upload/${row.id}/review`} className={styles.cardLink}>
        <div className={styles.body}>
          <p className={styles.title}>Ready to review</p>
          <p className={styles.sub}>{row.original_filename}</p>
        </div>
        <span className={styles.chev}>→</span>
      </Link>
    );
  }

  // failed
  return (
    <div className={`${styles.card} ${styles.cardFailed}`}>
      <div className={styles.body}>
        <p className={styles.title}>Extraction failed</p>
        <p className={styles.sub}>{row.original_filename}</p>
        {row.extraction_error && <p className={styles.error}>{row.extraction_error}</p>}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.btnPrimary} disabled={busy || pending} onClick={retry}>
          Retry
        </button>
        <Link href={`/coach?from=/plans&plan_file_id=${row.id}`} className={styles.btnSecondary}>
          Talk to coach
        </Link>
        <button type="button" className={styles.btnDanger} disabled={busy || pending} onClick={discard}>
          Discard
        </button>
      </div>
    </div>
  );
}
```

**Important:** Retry posts to `/extract` which requires `status === 'extracting'`. The card sees `failed`. Therefore retry needs to **first reset status to extracting**, *then* fire extract. Update accordingly:

```ts
async function retry() {
  setBusy(true);
  try {
    // Reset to extracting via a new lightweight endpoint, OR delete + re-upload — simpler: extend the GET handler.
    // Pragmatic fix: have the extract route accept an optional `?reset=1` param to allow rerun on failed.
    await fetch(`/api/plans/upload/${row.id}/extract?reset=1`, { method: "POST" });
  } finally {
    startTransition(() => router.refresh());
  }
}
```

Update `src/app/api/plans/upload/[id]/extract/route.ts` (Task 10's file) to accept `?reset=1`: when present and `status==='failed'`, call `updatePlanFileStatus(id, userId, 'extracting', null)` before invoking `runExtraction`. Without `?reset=1`, keep the existing 409 guard.

- [ ] **Step 4: SCSS**

```scss
// src/components/plans/InFlightUploadCard.module.scss
.card, .cardLink {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  text-decoration: none;
  color: inherit;
}
.cardLink:hover { border-color: var(--color-brown); }
.cardFailed { border-color: color-mix(in srgb, #B83232 50%, var(--color-border-default)); }
.body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.title { font-size: 0.9375rem; font-weight: 600; color: var(--color-fg-primary); margin: 0; }
.sub { font-size: 0.8125rem; color: var(--color-fg-tertiary); margin: 0; }
.error { font-size: 0.8125rem; color: #B83232; margin: 4px 0 0 0; }
.spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--color-border-default);
  border-top-color: var(--color-brown);
  border-radius: 50%;
  animation: spin 800ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.chev { font-size: 1.25rem; color: var(--color-fg-tertiary); }
.actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.btnPrimary, .btnSecondary, .btnDanger, .btnGhost {
  font-size: 0.8125rem;
  font-weight: 600;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-default);
  background: transparent;
  color: var(--color-fg-primary);
  text-decoration: none;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}
.btnPrimary { background: var(--color-brown); color: #fff; border-color: var(--color-brown); }
.btnDanger:hover:not(:disabled) { border-color: #B83232; color: #B83232; }
.btnGhost { font-weight: 500; color: var(--color-fg-secondary); }
```

- [ ] **Step 5: Wire into `/plans` page**

In `src/app/(app)/plans/page.tsx`, after the existing fetch, also fetch in-flight files:

```tsx
import { listInFlightPlanFiles } from "@/plans/files";
// ...
const planFiles = await listInFlightPlanFiles(userId);
// pass `planFiles` to <PlansPageClient />
```

In `src/app/(app)/plans/PlansPageClient.tsx`:
- Add `planFiles: { id, status, original_filename, extraction_error }[]` to `Props`.
- Render an `<section>` above the active plan card:

```tsx
{planFiles.length > 0 && (
  <section className={styles.inflight}>
    {planFiles.map((f) => <InFlightUploadCard key={f.id} row={f} />)}
  </section>
)}
```

Add `.inflight { display: flex; flex-direction: column; gap: var(--space-3); }` to `Plans.module.scss`.

- [ ] **Step 6: Run tests + tsc**

```bash
npx vitest run src/components/plans/__tests__/InFlightUploadCard.test.tsx
npx tsc --noEmit
```

Stage.

---

## Task 15: Review page (`/plans/upload/[id]/review`)

**Files:**
- Create: `src/app/(app)/plans/upload/[id]/review/page.tsx`
- Create: `src/app/(app)/plans/upload/[id]/review/ReviewClient.tsx`
- Create: `src/app/(app)/plans/upload/[id]/review/ReviewForm.tsx`
- Create: `src/app/(app)/plans/upload/[id]/review/Review.module.scss`
- Create: `src/app/(app)/plans/upload/[id]/review/__tests__/ReviewForm.test.tsx`

- [ ] **Step 1: Server page**

```tsx
// src/app/(app)/plans/upload/[id]/review/page.tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { plans, users } from "@/db/schema";
import { getPlanFileById } from "@/plans/files";
import { todayIso } from "@/lib/dates";
import { ReviewClient } from "./ReviewClient";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const { id } = await params;

  const file = await getPlanFileById(id, userId);
  if (!file) notFound();

  const [pref] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";

  const activeRows = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.is_active, true)))
    .limit(1);
  const hasActivePlan = activeRows.length > 0;

  return (
    <ReviewClient
      initialFile={{
        id: file.id,
        status: file.status,
        original_filename: file.original_filename,
        extraction_error: file.extraction_error,
        extracted_payload: file.extracted_payload,
      }}
      units={units}
      today={todayIso()}
      hasActivePlan={hasActivePlan}
    />
  );
}
```

- [ ] **Step 2: ReviewClient (status switch + polling)**

```tsx
// src/app/(app)/plans/upload/[id]/review/ReviewClient.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InFlightUploadCard } from "@/components/plans/InFlightUploadCard";
import { ReviewForm } from "./ReviewForm";
import styles from "./Review.module.scss";

interface FileSnapshot {
  id: string;
  status: "extracting" | "extracted" | "failed";
  original_filename: string;
  extraction_error: string | null;
  extracted_payload: unknown | null;
}

interface Props {
  initialFile: FileSnapshot;
  units: "mi" | "km";
  today: string;
  hasActivePlan: boolean;
}

export function ReviewClient({ initialFile, units, today, hasActivePlan }: Props) {
  const router = useRouter();
  const [file, setFile] = useState(initialFile);

  useEffect(() => {
    if (file.status !== "extracting") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/plans/upload/${file.id}`);
        if (!res.ok) return;
        const data = (await res.json()) as FileSnapshot;
        if (!cancelled) setFile(data);
      } catch { /* swallow */ }
    };
    const handle = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [file.id, file.status]);

  if (file.status === "extracting" || file.status === "failed") {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Review extracted plan</h1>
          <p className={styles.sub}>{file.original_filename}</p>
        </header>
        <InFlightUploadCard row={file} />
      </div>
    );
  }

  // extracted
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Review extracted plan</h1>
        <p className={styles.sub}>{file.original_filename}</p>
      </header>
      <ReviewForm
        fileId={file.id}
        payload={file.extracted_payload as never}
        units={units}
        today={today}
        hasActivePlan={hasActivePlan}
        onDiscarded={() => router.push("/plans")}
        onSaved={(planId) => router.push(`/plans/${planId}`)}
      />
    </div>
  );
}
```

- [ ] **Step 3: ReviewForm + SCSS**

```tsx
// src/app/(app)/plans/upload/[id]/review/ReviewForm.tsx
"use client";
import { useMemo, useState } from "react";
import { addDays, mondayOf } from "@/lib/dates";
import { PlanStats } from "@/app/(app)/plans/[id]/PlanStats";
import { MileageChart } from "@/app/(app)/plans/[id]/MileageChart";
import { WeekGrid } from "@/app/(app)/plans/[id]/WeekGrid";
import type { ExtractedPlan } from "@/extraction/schema";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./Review.module.scss";

interface Props {
  fileId: string;
  payload: ExtractedPlan;
  units: "mi" | "km";
  today: string;
  hasActivePlan: boolean;
  onDiscarded: () => void;
  onSaved: (planId: string) => void;
}

interface WeekBucket {
  monday: string;
  byDate: Map<string, WorkoutRow>;
  totalMeters: number;
  totalSeconds: number;
}

function bucketByWeek(rows: WorkoutRow[]): WeekBucket[] {
  const map = new Map<string, WeekBucket>();
  for (const w of rows) {
    const monday = mondayOf(w.date);
    let bucket = map.get(monday);
    if (!bucket) {
      bucket = { monday, byDate: new Map(), totalMeters: 0, totalSeconds: 0 };
      map.set(monday, bucket);
    }
    bucket.byDate.set(w.date, w);
    bucket.totalMeters += w.distance_meters == null ? 0 : Number(w.distance_meters);
    bucket.totalSeconds += w.duration_seconds ?? 0;
  }
  return Array.from(map.values()).sort((a, b) => (a.monday < b.monday ? -1 : 1));
}

export function ReviewForm({
  fileId, payload, units, today, hasActivePlan, onDiscarded, onSaved,
}: Props) {
  const [title, setTitle] = useState(payload.title);
  const [sport, setSport] = useState<"run" | "bike">(payload.sport);
  const [mode, setMode] = useState<"goal" | "indefinite">(payload.mode);
  const [startDate, setStartDate] = useState(payload.tentative_start_date ?? today);
  const [raceDate, setRaceDate] = useState(payload.goal?.race_date ?? "");
  const [raceDistance, setRaceDistance] = useState(payload.goal?.race_distance ?? "");
  const [targetTime, setTargetTime] = useState(payload.goal?.target_time ?? "");
  const [setActive, setSetActive] = useState(!hasActivePlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const materialized: WorkoutRow[] = useMemo(
    () =>
      payload.workouts.map((w) => ({
        id: `tmp-${w.day_offset}`,
        plan_id: "tmp",
        date: addDays(startDate, w.day_offset),
        sport: w.sport,
        type: w.type,
        distance_meters: w.distance_meters == null ? null : String(w.distance_meters),
        duration_seconds: w.duration_seconds,
        target_intensity: w.target_intensity,
        intervals: w.intervals,
        notes: w.notes,
      })) as WorkoutRow[],
    [payload.workouts, startDate],
  );

  const weeks = useMemo(() => bucketByWeek(materialized), [materialized]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const goal =
        mode === "goal"
          ? {
              race_date: raceDate || null,
              race_distance: raceDistance || null,
              target_time: targetTime || null,
            }
          : null;
      const res = await fetch(`/api/plans/upload/${fileId}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          sport, mode, goal,
          start_date: startDate,
          set_active: setActive,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Save failed");
        setBusy(false);
        return;
      }
      const { plan_id } = (await res.json()) as { plan_id: string };
      onSaved(plan_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  async function discard() {
    if (!confirm("Discard this upload?")) return;
    setBusy(true);
    try {
      await fetch(`/api/plans/upload/${fileId}`, { method: "DELETE" });
      onDiscarded();
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.lbl}>Title</span>
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <fieldset className={styles.field}>
          <legend className={styles.lbl}>Sport</legend>
          <label><input type="radio" checked={sport === "run"} onChange={() => setSport("run")} /> Run</label>
          <label><input type="radio" checked={sport === "bike"} onChange={() => setSport("bike")} /> Bike</label>
        </fieldset>
        <fieldset className={styles.field}>
          <legend className={styles.lbl}>Mode</legend>
          <label><input type="radio" checked={mode === "goal"} onChange={() => setMode("goal")} /> Goal</label>
          <label><input type="radio" checked={mode === "indefinite"} onChange={() => setMode("indefinite")} /> Indefinite</label>
        </fieldset>
        {mode === "goal" && (
          <div className={styles.goalRow}>
            <label className={styles.field}>
              <span className={styles.lbl}>Race date</span>
              <input className={styles.input} type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.lbl}>Distance</span>
              <input className={styles.input} value={raceDistance} onChange={(e) => setRaceDistance(e.target.value)} placeholder="e.g. Marathon" />
            </label>
            <label className={styles.field}>
              <span className={styles.lbl}>Target time</span>
              <input className={styles.input} value={targetTime} onChange={(e) => setTargetTime(e.target.value)} placeholder="e.g. 3:05" />
            </label>
          </div>
        )}
        <label className={styles.field}>
          <span className={styles.lbl}>Start date</span>
          <input className={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className={styles.help}>All workouts will be re-anchored from this date.</span>
        </label>
      </div>

      <div className={styles.preview}>
        <PlanStats workouts={materialized} units={units} />
        <MileageChart workouts={materialized} units={units} />
        <div className={styles.weeks}>
          {weeks.map((wk) => (
            <WeekGrid
              key={wk.monday}
              monday={wk.monday}
              weekTotalMeters={wk.totalMeters}
              weekTotalSeconds={wk.totalSeconds}
              byDate={wk.byDate}
              today={today}
              isActivePlan={false}
              units={units}
              onDayClick={() => {}}
            />
          ))}
        </div>
      </div>

      {error && <p className={styles.errorBanner} role="alert">{error}</p>}

      <footer className={styles.footer}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={setActive} onChange={(e) => setSetActive(e.target.checked)} />
          Save as active plan
        </label>
        <div className={styles.footerBtns}>
          <button type="button" className={styles.btnDanger} disabled={busy} onClick={discard}>Discard</button>
          <button type="button" className={styles.btnPrimary} disabled={busy || !title.trim()} onClick={save}>Save</button>
        </div>
      </footer>
    </>
  );
}
```

```scss
// src/app/(app)/plans/upload/[id]/review/Review.module.scss
.page { display: flex; flex-direction: column; max-width: 720px; margin: 0 auto; padding: var(--space-6) var(--space-4); gap: var(--space-5); }
.header { display: flex; flex-direction: column; gap: var(--space-1); }
.title { font-family: var(--font-display); font-size: 1.75rem; font-weight: 700; letter-spacing: -0.03em; line-height: 1; color: var(--color-fg-primary); margin: 0; }
.sub { font-size: 0.875rem; color: var(--color-fg-tertiary); margin: 0; }
.form { display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-5); background: var(--color-bg-surface); border: 1px solid var(--color-border-default); border-radius: var(--radius-lg); }
.field { display: flex; flex-direction: column; gap: var(--space-1); }
.lbl { font-size: 0.6875rem; color: var(--color-fg-tertiary); text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600; }
.input { font-size: 0.9375rem; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border-default); border-radius: var(--radius-md); background: var(--color-bg-surface); color: var(--color-fg-primary); }
.help { font-size: 0.75rem; color: var(--color-fg-tertiary); }
.goalRow { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-3); }
.preview { display: flex; flex-direction: column; gap: var(--space-5); }
.weeks { display: flex; flex-direction: column; gap: var(--space-5); }
.errorBanner { color: #B83232; font-size: 0.875rem; padding: var(--space-3); background: color-mix(in srgb, #B83232 8%, transparent); border-radius: var(--radius-md); margin: 0; }
.footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-border-subtle); }
.toggle { display: flex; align-items: center; gap: var(--space-2); font-size: 0.875rem; color: var(--color-fg-primary); }
.footerBtns { display: flex; gap: var(--space-2); }
.btnPrimary, .btnDanger {
  font-size: 0.875rem; font-weight: 600; padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); border: 1px solid transparent; cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}
.btnPrimary { background: var(--color-brown); color: #fff; }
.btnDanger { background: transparent; color: var(--color-fg-secondary); border-color: var(--color-border-default); &:hover:not(:disabled) { border-color: #B83232; color: #B83232; } }
```

- [ ] **Step 4: Failing test for ReviewForm**

```tsx
// src/app/(app)/plans/upload/[id]/review/__tests__/ReviewForm.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReviewForm } from "../ReviewForm";

const onSaved = vi.fn();
const onDiscarded = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  global.confirm = vi.fn(() => true) as typeof confirm;
});

const payload = {
  is_training_plan: true,
  title: "From File",
  sport: "run" as const,
  mode: "indefinite" as const,
  goal: null,
  tentative_start_date: "2026-05-04",
  workouts: [
    { day_offset: 0, sport: "run" as const, type: "easy" as const, distance_meters: 5000, duration_seconds: null, target_intensity: null, intervals: null, notes: "" },
    { day_offset: 6, sport: "run" as const, type: "long" as const, distance_meters: 16000, duration_seconds: null, target_intensity: null, intervals: null, notes: "" },
  ],
};

describe("ReviewForm", () => {
  it("renders title from payload + Save button + active toggle defaulting to true when no active plan", () => {
    render(<ReviewForm fileId="f1" payload={payload} units="mi" today="2026-04-27" hasActivePlan={false} onSaved={onSaved} onDiscarded={onDiscarded} />);
    expect(screen.getByDisplayValue("From File")).toBeInTheDocument();
    const toggle = screen.getByRole("checkbox", { name: /Save as active/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it("Save POSTs to the save endpoint with the editable fields", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ plan_id: "p1" }) });
    render(<ReviewForm fileId="f1" payload={payload} units="mi" today="2026-04-27" hasActivePlan={false} onSaved={onSaved} onDiscarded={onDiscarded} />);
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/plans/upload/f1/save");
    const body = JSON.parse((opts as { body: string }).body);
    expect(body).toMatchObject({ title: "From File", sport: "run", mode: "indefinite", start_date: "2026-05-04", set_active: true });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("p1"));
  });

  it("Discard DELETEs and calls onDiscarded", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    render(<ReviewForm fileId="f1" payload={payload} units="mi" today="2026-04-27" hasActivePlan onSaved={onSaved} onDiscarded={onDiscarded} />);
    fireEvent.click(screen.getByRole("button", { name: /Discard/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/plans/upload/f1", expect.objectContaining({ method: "DELETE" })));
    await waitFor(() => expect(onDiscarded).toHaveBeenCalled());
  });
});
```

- [ ] **Step 5: Run tests + tsc**

```bash
npx vitest run src/app/\(app\)/plans/upload/\[id\]/review/__tests__/ReviewForm.test.tsx
npx tsc --noEmit
```

Stage.

---

## Task 16: `read_uploaded_file` coach tool

**Files:**
- Create: `src/coach/tools/files.ts`
- Create: `src/coach/tools/__tests__/files.test.ts`
- Modify: `src/coach/types.ts`
- Modify: `src/coach/tools/index.ts`
- Modify: `src/coach/systemPrompt.ts`

- [ ] **Step 1: Update `ToolName` union**

In `src/coach/types.ts`, append `"read_uploaded_file"` to the `ToolName` union.

- [ ] **Step 2: Failing test**

```ts
// src/coach/tools/__tests__/files.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getPlanFileById = vi.fn();
const fetchPlanFileBytes = vi.fn();

vi.mock("@/plans/files", () => ({ getPlanFileById }));
vi.mock("@/extraction/blob", () => ({ fetchPlanFileBytes }));

import { read_uploaded_file_handler } from "../files";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("read_uploaded_file_handler", () => {
  it("rejects when row is missing or not owned", async () => {
    getPlanFileById.mockResolvedValueOnce(null);
    const result = await read_uploaded_file_handler({ plan_file_id: "f1" }, { userId: "u1" });
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("returns content blocks for PDF", async () => {
    getPlanFileById.mockResolvedValueOnce({
      id: "f1", userId: "u1", blob_url: "https://blob/x",
      original_filename: "plan.pdf", mime_type: "application/pdf",
    });
    fetchPlanFileBytes.mockResolvedValueOnce(new Uint8Array([0x25, 0x50]).buffer);
    const result = await read_uploaded_file_handler({ plan_file_id: "f1" }, { userId: "u1" });
    expect(result.content[0]).toMatchObject({
      type: "document",
      source: { type: "base64", media_type: "application/pdf" },
    });
  });

  it("returns text content for markdown", async () => {
    getPlanFileById.mockResolvedValueOnce({
      id: "f1", userId: "u1", blob_url: "https://blob/x",
      original_filename: "plan.md", mime_type: "text/markdown",
    });
    fetchPlanFileBytes.mockResolvedValueOnce(new TextEncoder().encode("# Plan\nWeek 1").buffer);
    const result = await read_uploaded_file_handler({ plan_file_id: "f1" }, { userId: "u1" });
    expect(result.content[0]).toMatchObject({ type: "text" });
  });
});
```

- [ ] **Step 3: Run, expect failure**

```bash
npx vitest run src/coach/tools/__tests__/files.test.ts
```

- [ ] **Step 4: Implement**

```ts
// src/coach/tools/files.ts
import type { Anthropic } from "@anthropic-ai/sdk";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { getPlanFileById } from "@/plans/files";
import { fetchPlanFileBytes } from "@/extraction/blob";
import type { ToolHandler } from "../types";

type Tool = Anthropic.Messages.Tool;
type Block = Anthropic.Messages.ContentBlockParam;

export const readUploadedFileTool: Tool = {
  name: "read_uploaded_file",
  description:
    "Read a previously uploaded training plan file. Use when the user wants help building a plan from a file that failed automatic extraction.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_file_id: { type: "string", description: "The UUID of the uploaded plan file." },
    },
    required: ["plan_file_id"],
  },
};

type Input = { plan_file_id: string };
type Output = { content: Block[]; error?: string };

function bufferToBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}
function bufferToText(buf: ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(buf);
}

const MAX_ROWS = 500;

export const read_uploaded_file_handler: ToolHandler<Input, Output> = async (input, ctx) => {
  const row = await getPlanFileById(input.plan_file_id, ctx.userId);
  if (!row) {
    return { content: [], error: "plan_file not found or not owned by user" };
  }

  const buf = await fetchPlanFileBytes(row.blob_url);
  const filename = row.original_filename;

  if (row.mime_type === "application/pdf") {
    return {
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: bufferToBase64(buf) },
        },
        { type: "text", text: `Filename: ${filename}` },
      ],
    };
  }

  if (row.mime_type === "text/csv") {
    const text = bufferToText(buf);
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = (parsed as { data: unknown[] }).data;
    const truncated = rows.slice(0, MAX_ROWS);
    const truncNote = rows.length > MAX_ROWS ? ` (showing first ${MAX_ROWS} of ${rows.length})` : "";
    return {
      content: [{ type: "text", text: `Filename: ${filename}${truncNote}\n${JSON.stringify(truncated, null, 2)}` }],
    };
  }

  if (
    row.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    row.mime_type === "application/vnd.ms-excel"
  ) {
    const wb = XLSX.read(buf, { type: "array" });
    const parts: string[] = [`Filename: ${filename}`];
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name]);
      const truncated = rows.slice(0, MAX_ROWS);
      const truncNote = rows.length > MAX_ROWS ? ` (first ${MAX_ROWS} of ${rows.length})` : "";
      parts.push(`Sheet: ${name}${truncNote}`);
      parts.push(JSON.stringify(truncated, null, 2));
    }
    return { content: [{ type: "text", text: parts.join("\n") }] };
  }

  if (row.mime_type === "text/markdown" || row.mime_type === "text/plain") {
    return { content: [{ type: "text", text: `Filename: ${filename}\n\n${bufferToText(buf)}` }] };
  }

  return { content: [], error: `unsupported mime: ${row.mime_type}` };
};
```

- [ ] **Step 5: Register in `tools/index.ts`**

In `src/coach/tools/index.ts`:
- Import: `import { readUploadedFileTool, read_uploaded_file_handler } from "./files";`
- Append `readUploadedFileTool` to the `TOOLS` array (after `update_coach_notes`, before `web_search`).
- Add `read_uploaded_file: read_uploaded_file_handler as AnyHandler,` to `HANDLERS`.
- Add `case "read_uploaded_file": return "Read uploaded file";` to `summarizeToolResult`.

- [ ] **Step 6: System-prompt note**

In `src/coach/systemPrompt.ts`, append a single bullet under the `# Available data (via tools)` section:

```
- **Uploaded plan files**: Call \`read_uploaded_file({ plan_file_id })\` to read a file the user uploaded but couldn't be auto-extracted. Use it to help them build the plan from the file.
```

The system prompt is frozen — this update is a one-time content change, not a per-request injection.

- [ ] **Step 7: Run tests + tsc**

```bash
npx vitest run src/coach/tools/__tests__/files.test.ts
npx tsc --noEmit
```

Stage.

---

## Task 17: Coach context — `plan_file_id` deep-link

**Files:**
- Modify: `src/coach/context.ts`
- Modify: `src/coach/types.ts`
- Modify: `src/coach/runner.ts`
- Modify: `src/app/api/coach/chat/route.ts`
- Modify: `src/coach/__tests__/context.test.ts`
- Find and modify the coach client component(s) that send `from_route` — extend with `plan_file_id`.

- [ ] **Step 1: Failing test for context**

Append to `src/coach/__tests__/context.test.ts`:

```ts
describe("renderContextPrefix planFile branch", () => {
  it("includes file-help block when planFile is provided", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: "Plans / manage page",
      planFile: {
        id: "f1",
        original_filename: "plan.pdf",
        status: "failed",
        extraction_error: "couldn't parse",
      },
    });
    expect(out).toContain("plan.pdf");
    expect(out).toContain("f1");
    expect(out).toContain("read_uploaded_file");
  });
  it("omits the block when planFile is null", () => {
    const out = renderContextPrefix({
      today: "2026-04-27", units: "mi", activePlan: null, coachNotes: "", fromLabel: null,
    });
    expect(out).not.toContain("read_uploaded_file");
  });
});
```

- [ ] **Step 2: Run, expect failure (prop type mismatch)**

```bash
npx vitest run src/coach/__tests__/context.test.ts
```

- [ ] **Step 3: Update `context.ts`**

Replace the `renderContextPrefix` signature + body:

```ts
type PlanFileSummary = {
  id: string;
  original_filename: string;
  status: "extracting" | "extracted" | "failed";
  extraction_error: string | null;
};

export function renderContextPrefix(params: {
  today: string;
  units: "mi" | "km";
  activePlan: ActivePlanSummary | null;
  coachNotes: string;
  fromLabel: string | null;
  planFile?: PlanFileSummary | null;
}): string {
  const lines: string[] = [];
  lines.push(`<context>`);
  lines.push(`Today: ${params.today}`);
  lines.push(`User units: ${params.units}`);
  if (params.activePlan) {
    const a = params.activePlan;
    const wks = a.weeks_left == null ? "indefinite" : `${a.weeks_left} weeks left`;
    lines.push(`Active plan: ${a.title} — ${wks}, ${a.completed} / ${a.workout_count} workouts done`);
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
  if (params.planFile) {
    lines.push(``);
    lines.push(`The user wants help with an unprocessed plan file.`);
    lines.push(`File id: ${params.planFile.id}`);
    lines.push(`Filename: ${params.planFile.original_filename}`);
    lines.push(`Status: ${params.planFile.status}${params.planFile.extraction_error ? ` (error: ${params.planFile.extraction_error.slice(0, 256)})` : ""}`);
    lines.push(`Call \`read_uploaded_file({ plan_file_id })\` to read it and help build a plan.`);
  }
  lines.push(`</context>`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Extend `RunInput` + `ChatRequestBody`**

In `src/coach/types.ts`:

```ts
export type ChatRequestBody = {
  message: string;
  from_route?: string;
  plan_file_id?: string;
};
```

In `src/coach/runner.ts`, add `planFileId?: string` to `RunInput`. After computing `activePlanSummary`, add:

```ts
let planFileSummary: { id: string; original_filename: string; status: "extracting" | "extracted" | "failed"; extraction_error: string | null } | null = null;
if (input.planFileId) {
  const { getPlanFileById } = await import("@/plans/files");
  const f = await getPlanFileById(input.planFileId, userId);
  if (f) {
    planFileSummary = {
      id: f.id, original_filename: f.original_filename, status: f.status, extraction_error: f.extraction_error,
    };
  }
}
```

Then pass `planFile: planFileSummary` into `renderContextPrefix(...)`.

The dynamic import keeps the `runner.ts` import graph small and avoids circular deps.

- [ ] **Step 5: Forward from API route**

In `src/app/api/coach/chat/route.ts`, read `plan_file_id` from the body and pass to `runCoach`:

```ts
const body = (await req.json()) as ChatRequestBody;
// ... existing validation ...
const generator = runCoach({
  userId: session.user.id,
  message: body.message,
  fromRoute: body.from_route,
  planFileId: body.plan_file_id,
  today: todayIso(),
});
```

- [ ] **Step 6: Forward from coach client**

Find the client component that sends the chat POST. Likely `src/components/coach/CoachChat.tsx` or similar. Search:

```bash
grep -rn "from_route" src/components/coach src/app
```

Whichever component reads `useSearchParams().get("from")`, also read `plan_file_id` and include it in the POST body.

- [ ] **Step 7: Run tests + tsc**

```bash
npx vitest run src/coach/__tests__/context.test.ts
npx tsc --noEmit
```

Stage.

---

## Task 18: Operational smoke test

**Files:** none (manual checklist; do not commit)

- [ ] **Step 1: Dev server up**

```bash
npm run dev
```

- [ ] **Step 2: Upload a real PDF**

Sign in. From `/plans`, click **↑ Upload plan**, pick a PDF training plan from disk. Confirm:
- The browser navigates to `/plans/upload/<id>/review`.
- Page shows "Extracting your plan…" spinner with the filename.
- Spinner clears within ~30–60 s (depends on plan size + Anthropic latency) and the review form appears.

- [ ] **Step 3: Review form**

Confirm:
- Title, sport, mode, start date are pre-filled from extraction.
- Changing the start date updates the WeekGrid preview (workouts shift to new dates).
- "Save as active plan" is on by default if you have no active plan, off otherwise.

- [ ] **Step 4: Save**

Click **Save**. Confirm:
- Browser redirects to `/plans/<new_plan_id>`.
- The plan renders with the right title, dates, and workouts.
- If `set_active` was on, the plan shows the **Active** badge and `/today` reflects it.
- `/plans` no longer shows the in-flight card for this upload.

- [ ] **Step 5: CSV / XLSX / MD**

Repeat steps 2–4 for a CSV, an XLSX, and a Markdown plan. Confirm extraction works for each format.

- [ ] **Step 6: Failure path**

Upload a non-plan PDF (e.g., a recipe or random article). Confirm:
- Review page renders the failed state with the message "This file doesn't look like a training plan."
- **Talk to coach** link goes to `/coach?from=/plans&plan_file_id=<id>`.
- In the coach panel, the per-turn context shows the file id and filename. Ask "help me build this plan" — the coach calls `read_uploaded_file` (you'll see "Read uploaded file" in the tool indicator) and continues.

- [ ] **Step 7: Discard**

From a failed card on `/plans` (or on the review page), click **Discard**. Confirm:
- The row vanishes from `/plans`.
- No stale row in the DB (`select * from plan_file where id = '...'`).
- The Vercel Blob object is removed (or at least, the proxy returns 404).

- [ ] **Step 8: Cross-user**

Open the dev console while signed in as user A. POST to `/api/plans/upload/<some_other_user_id>/save` (use a recent file id from another account if available, or just a guessed UUID). Confirm 404 response. Same for `GET .../file`.

---

## Self-review

**Spec coverage:**
- §3 Lifecycle (5 states) — Tasks 8–12 cover the routes; Task 11 covers save semantics. ✓
- §4 Schema — Task 2. ✓
- §5 Routes (6 routes) — Tasks 8 (upload), 9 (status + discard), 10 (extract), 11 (save), 12 (file proxy). ✓
- §6 Extraction (formatting + Zod schema + error handling) — Tasks 5, 6, 7. ✓
- §7 UI (PlanActionRow rewire, UploadDropzone, in-flight section, review page) — Tasks 13, 14, 15. ✓
- §8 Coach integration (read_uploaded_file tool + context block + system-prompt update) — Tasks 16, 17. ✓
- §9 Dependencies — Task 1. ✓
- §10 Environment — Task 1. ✓
- §11 Testing — Each task ships its tests; Task 18 is the operational smoke. ✓
- §12 Security — All routes verify session; Task 12 enforces ownership on the file proxy; Task 16 enforces ownership in the coach handler. ✓

**Placeholder scan:** No "TBD" or unfinished steps. Two areas with clearly-marked verify-against-SDK notes (Task 7 on Anthropic `messages.parse`, Task 8 on Vercel Blob `access`) are deliberate — they require reading installed package types rather than guessing.

**Type consistency:**
- `PlanFileRow` shape (Task 3) matches what `GET /api/plans/upload/[id]` returns (Task 9) and what the review page consumes (Task 15). ✓
- `ExtractedPlan` (Task 5) is the single shape emitted by `runExtraction` (Task 7), stored on `extracted_payload`, and consumed by `ReviewForm` (Task 15) and the save handler (Task 11). ✓
- `MaterializedWorkout` (Task 4) is consumed by Task 11's insert and by Task 15's `WorkoutRow`-shaped preview adapter. ✓
- `ToolName` union (`src/coach/types.ts`) is updated in Task 16. ✓

**One gotcha worth flagging during execution:** the `extract` route is invoked twice — once on initial upload (Task 13's dropzone) and once on retry (Task 14's failed card). The retry path needs the `?reset=1` workaround documented in Task 14 Step 3. If executed out of order, the retry route returns 409 and the user can't recover from a failed extraction without deleting the file. Implementer should keep these in sync.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-phase-7-upload-pipeline.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review (spec → quality). Subagents are told NOT to commit; you commit between batches.
2. **Inline Execution** — `superpowers:executing-plans` in this session.

Which approach?
