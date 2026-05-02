# Interval Distance Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `display_unit` to `IntervalSpec` so interval distances preserve their original expression ("1600m" stays "1600m", "1 mile" stays "1 mi") regardless of the user's general distance preference, then re-enable the interval UI.

**Architecture:** `display_unit` is an optional enum field on `IntervalSpec` (JSONB — no DB migration). It's set by both the extraction LLM and the coach tool at write time. The display layer uses it to format precisely; a round-number heuristic covers old rows that predate the field.

**Tech Stack:** TypeScript, Next.js App Router, Drizzle ORM (Postgres JSONB), Zod, Anthropic SDK, Vitest

---

## File Map

| File | What changes |
|------|-------------|
| `src/server/db/schema.ts` | Add `display_unit` to `IntervalSpec` TypeScript type |
| `src/server/extraction/schema.ts` | Add `display_unit` to `IntervalSpecZ` Zod schema |
| `src/lib/format.ts` | Add `formatIntervalDistance`, update `IntervalSummaryInput` + `formatIntervalSummary` |
| `src/lib/__tests__/format.test.ts` | Tests for `formatIntervalDistance` |
| `src/server/extraction/runtime.ts` | Add `display_unit` guidance to `EXTRACTION_SYSTEM_PROMPT` |
| `src/server/coach/tools/plans.ts` | Add `intervals` to tool schema, `UpsertOp` type, and handler insert |
| `src/server/coach/system-prompt.ts` | Add interval distance section |
| `src/components/workouts/workout-detail-sheet.tsx` | Use `formatIntervalDistance`, remove `hasNotes` suppression |
| `src/app/(app)/today/hero-workout.tsx` | Use `formatIntervalDistance`, remove `hasNotes` suppression |

---

## Task 1: Add `display_unit` to `IntervalSpec` type and Zod schema

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/extraction/schema.ts`

- [ ] **Step 1: Update `IntervalSpec` in `src/server/db/schema.ts`**

The current type (around line 70) is:
```typescript
export type IntervalSpec = {
  reps: number;
  distance_m?: number;
  duration_s?: number;
  target_intensity?: TargetIntensity;
  rest?: { duration_s?: number; distance_m?: number };
};
```

Replace it with:
```typescript
export type IntervalSpec = {
  reps: number;
  distance_m?: number;
  display_unit?: "m" | "km" | "mi";
  duration_s?: number;
  target_intensity?: TargetIntensity;
  rest?: {
    duration_s?: number;
    distance_m?: number;
    display_unit?: "m" | "km" | "mi";
  };
};
```

- [ ] **Step 2: Update `IntervalSpecZ` in `src/server/extraction/schema.ts`**

The current schema (around line 26) is:
```typescript
const IntervalSpecZ = z.object({
  reps: z.number().int().positive(),
  distance_m: z.number().optional(),
  duration_s: z.number().optional(),
  target_intensity: TargetIntensityZ.optional(),
  rest: z
    .object({
      duration_s: z.number().optional(),
      distance_m: z.number().optional(),
    })
    .optional(),
});
```

Replace it with:
```typescript
const IntervalSpecZ = z.object({
  reps: z.number().int().positive(),
  distance_m: z.number().optional(),
  display_unit: z.enum(["m", "km", "mi"]).optional(),
  duration_s: z.number().optional(),
  target_intensity: TargetIntensityZ.optional(),
  rest: z
    .object({
      duration_s: z.number().optional(),
      distance_m: z.number().optional(),
      display_unit: z.enum(["m", "km", "mi"]).optional(),
    })
    .optional(),
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts src/server/extraction/schema.ts
git commit -m "feat: add display_unit to IntervalSpec type and extraction schema"
```

---

## Task 2: Add `formatIntervalDistance` and update `formatIntervalSummary`

**Files:**
- Modify: `src/lib/format.ts`
- Modify: `src/lib/__tests__/format.test.ts`

- [ ] **Step 1: Write failing tests for `formatIntervalDistance`**

Add a new `describe` block at the bottom of `src/lib/__tests__/format.test.ts`. Also update the import to include `formatIntervalDistance` and `formatIntervalSummary`:

```typescript
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatPaceRange,
  formatIntervalDistance,
  formatIntervalSummary,
  metersToUnits,
} from "../format";
```

Add at the bottom of the file:

```typescript
describe("formatIntervalDistance", () => {
  it('display_unit "m" → integer meters with m suffix', () => {
    expect(formatIntervalDistance(1600, "m", "mi")).toBe("1600m");
    expect(formatIntervalDistance(400, "m", "mi")).toBe("400m");
  });
  it('display_unit "km" → integer km with km suffix', () => {
    expect(formatIntervalDistance(1000, "km", "mi")).toBe("1km");
    expect(formatIntervalDistance(5000, "km", "mi")).toBe("5km");
  });
  it('display_unit "mi" → miles rounded to nearest 1/8', () => {
    expect(formatIntervalDistance(1609.344, "mi", "mi")).toBe("1 mi");
    expect(formatIntervalDistance(804.672, "mi", "mi")).toBe("0.5 mi");
  });
  it("no display_unit, multiple of 1000 → km heuristic", () => {
    expect(formatIntervalDistance(3000, undefined, "mi")).toBe("3km");
    expect(formatIntervalDistance(1000, undefined, "mi")).toBe("1km");
  });
  it("no display_unit, multiple of 100 (not 1000) → meters heuristic", () => {
    expect(formatIntervalDistance(1600, undefined, "mi")).toBe("1600m");
    expect(formatIntervalDistance(800, undefined, "mi")).toBe("800m");
  });
  it("no display_unit, non-round value → user units fallback", () => {
    // 1500m is divisible by 100 → meters
    expect(formatIntervalDistance(1500, undefined, "mi")).toBe("1500m");
    // 1750m is divisible by 50 but not 100 → user units
    expect(formatIntervalDistance(1750, undefined, "mi")).toBe("1.1 mi");
    expect(formatIntervalDistance(1750, undefined, "km")).toBe("1.8 km");
  });
});

describe("formatIntervalSummary", () => {
  it("returns null for empty array", () => {
    expect(formatIntervalSummary([], "mi")).toBeNull();
  });
  it("uses display_unit when present", () => {
    const result = formatIntervalSummary(
      [{ reps: 5, distance_m: 1600, display_unit: "m" }],
      "mi"
    );
    expect(result).toBe("5 × 1600m");
  });
  it("falls back to heuristic when display_unit absent", () => {
    const result = formatIntervalSummary(
      [{ reps: 10, distance_m: 1000 }],
      "mi"
    );
    expect(result).toBe("10 × 1km");
  });
  it("includes pace range when present", () => {
    const result = formatIntervalSummary(
      [{ reps: 5, distance_m: 1600, display_unit: "m", target_intensity: { pace: { min_seconds_per_km: 234, max_seconds_per_km: 240 } } }],
      "mi"
    );
    expect(result).toBe("5 × 1600m @ 6:17–6:26");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/__tests__/format.test.ts
```
Expected: failures on `formatIntervalDistance` and `formatIntervalSummary` (not exported yet).

- [ ] **Step 3: Add `formatIntervalDistance` to `src/lib/format.ts`**

After the existing `formatPaceRange` function and before `IntervalSummaryInput`, insert:

```typescript
export function formatIntervalDistance(
  meters: number,
  displayUnit: "m" | "km" | "mi" | undefined,
  userUnits: Units
): string {
  if (displayUnit === "m") return `${Math.round(meters)}m`;
  if (displayUnit === "km") return `${Math.round(meters / 1000)}km`;
  if (displayUnit === "mi") {
    const miles = meters / METERS_PER_MILE;
    const rounded = Math.round(miles * 8) / 8;
    return `${rounded} mi`;
  }
  // Fallback heuristic for rows without display_unit
  if (meters % 1000 === 0) return `${meters / 1000}km`;
  if (meters % 100 === 0) return `${Math.round(meters)}m`;
  return `${metersToUnits(meters, userUnits).toFixed(1)} ${userUnits}`;
}
```

- [ ] **Step 4: Update `IntervalSummaryInput` interface to include `display_unit`**

The current interface (around line 66) is:
```typescript
export interface IntervalSummaryInput {
  reps: number;
  distance_m?: number;
  duration_s?: number;
  target_intensity?: { pace?: PaceRangeInput };
  rest?: { duration_s?: number; distance_m?: number };
}
```

Replace with:
```typescript
export interface IntervalSummaryInput {
  reps: number;
  distance_m?: number;
  display_unit?: "m" | "km" | "mi";
  duration_s?: number;
  target_intensity?: { pace?: PaceRangeInput };
  rest?: { duration_s?: number; distance_m?: number; display_unit?: "m" | "km" | "mi" };
}
```

- [ ] **Step 5: Update `formatIntervalSummary` to use `formatIntervalDistance`**

The current `measure` expression inside `formatIntervalSummary` (around line 81) is:
```typescript
const measure =
  iv.distance_m != null
    ? `${metersToUnits(iv.distance_m, units).toFixed(2).replace(/\.?0+$/, "")} ${units}`
    : iv.duration_s != null
      ? (formatDuration(iv.duration_s) ?? "")
      : "";
```

Replace with:
```typescript
const measure =
  iv.distance_m != null
    ? formatIntervalDistance(iv.distance_m, iv.display_unit, units)
    : iv.duration_s != null
      ? (formatDuration(iv.duration_s) ?? "")
      : "";
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/format.test.ts
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/format.ts src/lib/__tests__/format.test.ts
git commit -m "feat: add formatIntervalDistance with display_unit support"
```

---

## Task 3: Update extraction prompt with `display_unit` guidance

**Files:**
- Modify: `src/server/extraction/runtime.ts`

- [ ] **Step 1: Append display_unit guidance to `EXTRACTION_SYSTEM_PROMPT`**

The current system prompt ends with:
```typescript
- If this isn't a training plan, set is_training_plan: false and leave the rest as empty defaults: title="", sport="run", mode="indefinite", goal=null, tentative_start_date=null, workouts=[].`;
```

Replace the closing backtick line so it ends with:
```typescript
- If this isn't a training plan, set is_training_plan: false and leave the rest as empty defaults: title="", sport="run", mode="indefinite", goal=null, tentative_start_date=null, workouts=[].
- For each interval and its rest, set display_unit to match how the source plan expressed the distance: "m" for metre distances (400m, 800m, 1600m), "km" for kilometre distances (1km, 5km, 10km), "mi" for mile distances (1 mile, half mile, 2 miles). Never convert — preserve the original expression.`;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/extraction/runtime.ts
git commit -m "feat: add display_unit guidance to extraction system prompt"
```

---

## Task 4: Extend `update_workouts` coach tool with intervals

**Files:**
- Modify: `src/server/coach/tools/plans.ts`

- [ ] **Step 1: Add `intervals` to the `updateWorkoutsTool` JSON schema**

Find the `workout` object inside `updateWorkoutsTool.input_schema` (around line 114). The current `workout` properties are:
```typescript
workout: {
  type: "object",
  properties: {
    type: { type: "string" },
    distance_km: { type: "number" },
    duration_minutes: { type: "number" },
    notes: { type: "string" },
  },
  required: ["type"],
},
```

Replace with:
```typescript
workout: {
  type: "object",
  properties: {
    type: { type: "string" },
    distance_km: { type: "number" },
    duration_minutes: { type: "number" },
    notes: { type: "string" },
    intervals: {
      type: "array",
      description: "Structured interval set for quality workouts.",
      items: {
        type: "object",
        properties: {
          reps: { type: "number", description: "Number of repetitions." },
          distance_m: { type: "number", description: "Distance per rep in metres." },
          display_unit: {
            type: "string",
            enum: ["m", "km", "mi"],
            description: "How to display the distance. Match the unit you're thinking in: 1600m → 'm', 1km → 'km', 1 mile → 'mi'.",
          },
          duration_s: { type: "number", description: "Duration per rep in seconds (alternative to distance_m)." },
          target_intensity: {
            type: "object",
            properties: {
              pace: {
                type: "object",
                properties: {
                  min_seconds_per_km: { type: "number" },
                  max_seconds_per_km: { type: "number" },
                },
              },
              hr: {
                type: "object",
                properties: {
                  min_bpm: { type: "number" },
                  max_bpm: { type: "number" },
                  zone: { type: "string" },
                },
              },
              rpe: { type: "number", description: "Rate of perceived exertion, 1–10." },
            },
          },
          rest: {
            type: "object",
            properties: {
              duration_s: { type: "number", description: "Rest duration in seconds." },
              distance_m: { type: "number", description: "Rest distance in metres (e.g. jog recovery)." },
              display_unit: {
                type: "string",
                enum: ["m", "km", "mi"],
                description: "How to display the rest distance.",
              },
            },
          },
        },
        required: ["reps"],
      },
    },
  },
  required: ["type"],
},
```

- [ ] **Step 2: Update the `UpsertOp` TypeScript type to include `intervals`**

The current `UpsertOp` type (around line 285) is:
```typescript
type UpsertOp = {
  op: "upsert";
  date: string;
  workout: {
    type: string;
    distance_km?: number;
    duration_minutes?: number;
    notes?: string;
  };
};
```

Replace with:
```typescript
type UpsertOp = {
  op: "upsert";
  date: string;
  workout: {
    type: string;
    distance_km?: number;
    duration_minutes?: number;
    notes?: string;
    intervals?: import("@/server/db/schema").IntervalSpec[] | null;
  };
};
```

- [ ] **Step 3: Update the `db.insert` call in `update_workouts_handler` to persist intervals**

The current insert (around line 327) is:
```typescript
await db.insert(workouts).values({
  plan_id,
  date: op.date,
  sport: plan.sport,
  type: op.workout.type as (typeof workouts.$inferInsert)["type"],
  distance_meters:
    op.workout.distance_km != null ? String(op.workout.distance_km * 1000) : null,
  duration_seconds:
    op.workout.duration_minutes != null ? op.workout.duration_minutes * 60 : null,
  notes: op.workout.notes ?? "",
});
```

Replace with:
```typescript
await db.insert(workouts).values({
  plan_id,
  date: op.date,
  sport: plan.sport,
  type: op.workout.type as (typeof workouts.$inferInsert)["type"],
  distance_meters:
    op.workout.distance_km != null ? String(op.workout.distance_km * 1000) : null,
  duration_seconds:
    op.workout.duration_minutes != null ? op.workout.duration_minutes * 60 : null,
  notes: op.workout.notes ?? "",
  intervals: op.workout.intervals ?? null,
});
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/coach/tools/plans.ts
git commit -m "feat: extend update_workouts tool with intervals array"
```

---

## Task 5: Add interval distance guidance to coach system prompt

**Files:**
- Modify: `src/server/coach/system-prompt.ts`

- [ ] **Step 1: Add interval distances section**

The current prompt ends with the `# Output` section. Insert a new `# Interval distances` section after `# Output` (before the closing backtick of the template literal):

Find this block at the end of the prompt (around line 85–92):
```
# Output
- Match length to the question. "My week was off" → 2–3 sentences. Detailed training question → detailed answer.
- Specific numbers (paces, distances, dates) from tool results.
- One focused suggestion beats five hedged ones.
- Markdown renders. Bold for key paces and dates; bullets for workout structures.
- After a plan write, end with one line summarizing the change.
- Don't narrate tool mechanics — the athlete sees the indicators.
`;
```

Replace the closing backtick with:
```
# Output
- Match length to the question. "My week was off" → 2–3 sentences. Detailed training question → detailed answer.
- Specific numbers (paces, distances, dates) from tool results.
- One focused suggestion beats five hedged ones.
- Markdown renders. Bold for key paces and dates; bullets for workout structures.
- After a plan write, end with one line summarizing the change.
- Don't narrate tool mechanics — the athlete sees the indicators.

# Interval distances
Use the \`intervals\` array on \`update_workouts\` for any quality workout with a defined repeat structure. Set \`distance_m\` in metres and \`display_unit\` to match your intent — the display layer handles the final formatting:
- 400m repeat → \`distance_m: 400, display_unit: "m"\`
- 800m repeat → \`distance_m: 800, display_unit: "m"\`
- 1600m repeat → \`distance_m: 1600, display_unit: "m"\`
- 1km repeat → \`distance_m: 1000, display_unit: "km"\`
- 5km repeat → \`distance_m: 5000, display_unit: "km"\`
- 1 mile repeat → \`distance_m: 1609, display_unit: "mi"\`
- half-mile repeat → \`distance_m: 805, display_unit: "mi"\`

Never convert interval distances to the user's preferred unit — a "mile repeat" is not "1600m" and a "1600m repeat" is not "1 mile". The user's \`User units\` preference applies only to total workout distance (\`distance_km\`), not to interval repeats.
`;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/coach/system-prompt.ts
git commit -m "feat: add interval distance guidance to coach system prompt"
```

---

## Task 6: Update UI components to use `formatIntervalDistance` and re-enable intervals

**Files:**
- Modify: `src/components/workouts/workout-detail-sheet.tsx`
- Modify: `src/app/(app)/today/hero-workout.tsx`

- [ ] **Step 1: Update `workout-detail-sheet.tsx`**

**a) Add `formatIntervalDistance` to the import from `@/lib/format`.**

Current import (around line 1–5):
```tsx
import { formatDistance, formatDuration, formatPaceRange, metersToUnits } from "@/lib/format";
```
Replace with:
```tsx
import { formatDistance, formatDuration, formatPaceRange, formatIntervalDistance } from "@/lib/format";
```

**b) Remove the `hasNotes` suppression of intervals (around line 47–51).**

Current:
```tsx
const hasNotes = !!workout.notes;
const t = hasNotes
  ? ({} as TargetIntensity)
  : ((workout.target_intensity ?? {}) as TargetIntensity);
const intervals = hasNotes ? null : ((workout.intervals ?? null) as IntervalSpec[] | null);
```
Replace with:
```tsx
const hasNotes = !!workout.notes;
const t = hasNotes
  ? ({} as TargetIntensity)
  : ((workout.target_intensity ?? {}) as TargetIntensity);
const intervals = (workout.intervals ?? null) as IntervalSpec[] | null;
```

**c) Replace the inline distance formatting inside the intervals map (around line 132–148).**

Current:
```tsx
{iv.reps} ×{" "}
{[
  iv.distance_m != null
    ? `${metersToUnits(iv.distance_m, units).toFixed(2)} ${units}`
    : null,
  formatDuration(iv.duration_s),
]
  .filter(Boolean)
  .join(" · ")}
{iv.target_intensity?.pace
  ? ` @ ${formatPaceRange(iv.target_intensity.pace, units) ?? ""}`
  : null}
{iv.rest?.duration_s != null
  ? ` / ${formatDuration(iv.rest.duration_s) ?? ""} rest`
  : null}
{iv.rest?.distance_m != null
  ? ` / ${metersToUnits(iv.rest.distance_m, units).toFixed(2)} ${units} rest`
  : null}
```
Replace with:
```tsx
{iv.reps} ×{" "}
{[
  iv.distance_m != null
    ? formatIntervalDistance(iv.distance_m, iv.display_unit, units)
    : null,
  formatDuration(iv.duration_s),
]
  .filter(Boolean)
  .join(" · ")}
{iv.target_intensity?.pace
  ? ` @ ${formatPaceRange(iv.target_intensity.pace, units) ?? ""}`
  : null}
{iv.rest?.duration_s != null
  ? ` / ${formatDuration(iv.rest.duration_s) ?? ""} rest`
  : null}
{iv.rest?.distance_m != null
  ? ` / ${formatIntervalDistance(iv.rest.distance_m, iv.rest.display_unit, units)} rest`
  : null}
```

- [ ] **Step 2: Update `hero-workout.tsx`**

**a) Add `formatIntervalDistance` to the import from `@/lib/format`.**

Current import (find the line that imports from `@/lib/format`):
```tsx
import { formatDistance, formatDuration, formatPaceRange, metersToUnits } from "@/lib/format";
```
Replace with:
```tsx
import { formatDistance, formatDuration, formatPaceRange, formatIntervalDistance } from "@/lib/format";
```

**b) Remove the `hasNotes` suppression of intervals (around line 31–33).**

Current:
```tsx
const intervals: IntervalSpec[] | null = hasNotes
  ? null
  : ((workout.intervals as IntervalSpec[] | null) ?? null);
```
Replace with:
```tsx
const intervals: IntervalSpec[] | null =
  (workout.intervals as IntervalSpec[] | null) ?? null;
```

**c) Replace the inline distance formatting inside the intervals map (around line 101–117).**

Current:
```tsx
{iv.reps} ×{" "}
{[
  iv.distance_m != null
    ? `${metersToUnits(iv.distance_m, units).toFixed(2)} ${units}`
    : null,
  formatDuration(iv.duration_s),
]
  .filter(Boolean)
  .join(" · ")}
{iv.target_intensity?.pace
  ? ` @ ${formatPaceRange(iv.target_intensity.pace, units) ?? ""}`
  : null}
{iv.rest?.duration_s != null
  ? ` / ${formatDuration(iv.rest.duration_s) ?? ""} rest`
  : null}
{iv.rest?.distance_m != null
  ? ` / ${metersToUnits(iv.rest.distance_m, units).toFixed(2)} ${units} rest`
  : null}
```
Replace with:
```tsx
{iv.reps} ×{" "}
{[
  iv.distance_m != null
    ? formatIntervalDistance(iv.distance_m, iv.display_unit, units)
    : null,
  formatDuration(iv.duration_s),
]
  .filter(Boolean)
  .join(" · ")}
{iv.target_intensity?.pace
  ? ` @ ${formatPaceRange(iv.target_intensity.pace, units) ?? ""}`
  : null}
{iv.rest?.duration_s != null
  ? ` / ${formatDuration(iv.rest.duration_s) ?? ""} rest`
  : null}
{iv.rest?.distance_m != null
  ? ` / ${formatIntervalDistance(iv.rest.distance_m, iv.rest.display_unit, units)} rest`
  : null}
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/workouts/workout-detail-sheet.tsx src/app/(app)/today/hero-workout.tsx
git commit -m "feat: use formatIntervalDistance in UI, re-enable interval display"
```

---

## Self-Review Checklist

- [x] **Task 1** adds `display_unit` to both the TS type and Zod schema — spec Section 1 ✓
- [x] **Task 2** adds `formatIntervalDistance` with all cases + updates `formatIntervalSummary` — spec Section 2 ✓
- [x] **Task 3** updates extraction prompt — spec Section 3 ✓
- [x] **Task 4** extends tool schema (full shape, no `...` placeholders), `UpsertOp` type, and handler — spec Section 4 ✓
- [x] **Task 5** adds coach system prompt guidance — spec Section 4 ✓
- [x] **Task 6** fixes both UI components, removes `hasNotes` suppression for intervals, uses `formatIntervalDistance` for both interval and rest distances — spec Section 2 re-enable ✓
- [x] `formatIntervalDistance` is defined in Task 2 before it is referenced in Task 6 ✓
- [x] `IntervalSummaryInput.display_unit` added in Task 2 so `formatIntervalSummary` calls compile ✓
- [x] No TBD, TODO, or placeholder steps ✓
