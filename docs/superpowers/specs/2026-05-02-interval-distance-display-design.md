# Interval Distance Display with Preserved Intent

**Date:** 2026-05-02  
**Status:** Approved

## Problem

Interval workout distances are currently converted to the user's preferred unit at display time. A user with miles preference sees "5 × 0.99 mi" instead of "5 × 1600m", and "10 × 0.62 mi" instead of "10 × 1000m". This is wrong — running interval distances have a conventional expression (400m, 800m, 1600m, 1 mile) that must be preserved regardless of the user's general distance preference. The interval UI has been temporarily hidden as a workaround.

The root cause is two-fold:
1. `IntervalSpec` has no way to record the intended display unit — only `distance_m` in raw meters.
2. Both `formatIntervalSummary` and the inline interval renderers blindly call `metersToUnits(distance_m, userUnits)`.

## Solution Overview

Add `display_unit?: "m" | "km" | "mi"` to `IntervalSpec`. This field is set at data-entry time (extraction LLM or coach tool) to capture the original intent. The display layer uses it to format precisely; a heuristic covers old rows that lack it.

No DB migration is needed — `intervals` is a JSONB column, and the field is optional.

---

## Section 1 — Data Model

### `IntervalSpec` type (`src/server/db/schema.ts`)

Add `display_unit` to the type and to the `rest` sub-object:

```typescript
export type IntervalSpec = {
  reps: number;
  distance_m?: number;
  display_unit?: "m" | "km" | "mi";   // how distance_m should be expressed
  duration_s?: number;
  target_intensity?: TargetIntensity;
  rest?: {
    duration_s?: number;
    distance_m?: number;
    display_unit?: "m" | "km" | "mi"; // how rest distance should be expressed
  };
};
```

### Extraction Zod schema (`src/server/extraction/schema.ts`)

Mirror the same field in `IntervalSpecZ`:

```typescript
const IntervalSpecZ = z.object({
  reps: z.number().int().positive(),
  distance_m: z.number().optional(),
  display_unit: z.enum(["m", "km", "mi"]).optional(),
  duration_s: z.number().optional(),
  target_intensity: TargetIntensityZ.optional(),
  rest: z.object({
    duration_s: z.number().optional(),
    distance_m: z.number().optional(),
    display_unit: z.enum(["m", "km", "mi"]).optional(),
  }).optional(),
});
```

---

## Section 2 — Display Layer

### New helper: `formatIntervalDistance` (`src/lib/format.ts`)

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
    // Round to nearest 1/8 mile for clean display (1.0, 0.5, 1.5, etc.)
    const rounded = Math.round(miles * 8) / 8;
    return `${rounded} mi`;
  }
  // Fallback heuristic for old data without display_unit
  if (meters % 1000 === 0) return `${meters / 1000}km`;
  if (meters % 100 === 0) return `${Math.round(meters)}m`;
  return `${metersToUnits(meters, userUnits).toFixed(1)} ${userUnits}`;
}
```

### Update `formatIntervalSummary` (`src/lib/format.ts`)

The `IntervalSummaryInput` interface gains `display_unit`. The `measure` expression replaces the old `metersToUnits` call:

```typescript
const measure =
  iv.distance_m != null
    ? formatIntervalDistance(iv.distance_m, iv.display_unit, units)
    : iv.duration_s != null
      ? (formatDuration(iv.duration_s) ?? "")
      : "";
```

### Update inline renderers

Both `src/components/workouts/workout-detail-sheet.tsx` and `src/app/(app)/today/hero-workout.tsx` have inline distance rendering inside the intervals map. Replace:

```tsx
// before
`${metersToUnits(iv.distance_m, units).toFixed(2)} ${units}`

// after
formatIntervalDistance(iv.distance_m, iv.display_unit, units)
```

Apply the same replacement to `iv.rest.distance_m` rendering in both files.

### Re-enable interval UI

Remove the `hasNotes ? null : intervals` suppression in both components. Intervals and notes can coexist — render intervals first, then the notes paragraph below. Any CSS `display: none` workarounds in module.scss files are reverted.

---

## Section 3 — Extraction Prompt

Append to `EXTRACTION_SYSTEM_PROMPT` in `src/server/extraction/runtime.ts`:

> For each interval and its rest, set `display_unit` to match how the source plan expressed the distance: `"m"` for metre distances (400m, 1600m), `"km"` for kilometre distances (1km, 5km), `"mi"` for mile distances (1 mile, half mile). Never convert — preserve the original expression.

---

## Section 4 — Coach Tool Extension

### Tool schema (`src/server/coach/tools/plans.ts`)

Add an optional `intervals` array to the workout object inside `updateWorkoutsTool`:

```json
intervals: {
  type: "array",
  description: "Structured interval set for quality workouts.",
  items: {
    type: "object",
    properties: {
      reps:         { type: "number" },
      distance_m:   { type: "number", description: "Distance in metres." },
      display_unit: { type: "string", enum: ["m", "km", "mi"],
                      description: "How to display the distance. Match the unit you're thinking in." },
      duration_s:   { type: "number", description: "Duration in seconds (alternative to distance_m)." },
      target_intensity: { type: "object", ... },
      rest: {
        type: "object",
        properties: {
          duration_s:   { type: "number" },
          distance_m:   { type: "number" },
          display_unit: { type: "string", enum: ["m", "km", "mi"] }
        }
      }
    },
    required: ["reps"]
  }
}
```

### Handler (`src/server/coach/tools/plans.ts`)

Extend `UpsertOp.workout` type and the `db.insert` call to include `intervals`:

```typescript
await db.insert(workouts).values({
  ...existingFields,
  intervals: op.workout.intervals ?? null,
});
```

### Coach system prompt (`src/server/coach/system-prompt.ts`)

Add a section after `# Output`:

```
# Interval distances
Use the intervals array for quality workouts. Set distance_m in metres and display_unit to match your intent:
- "400m repeat" → distance_m: 400, display_unit: "m"
- "1600m repeat" → distance_m: 1600, display_unit: "m"
- "1km repeat" → distance_m: 1000, display_unit: "km"
- "5km repeat" → distance_m: 5000, display_unit: "km"
- "1 mile repeat" → distance_m: 1609, display_unit: "mi"
- "half-mile repeat" → distance_m: 805, display_unit: "mi"

Never convert interval distances to the user's unit preference — the display layer handles that. A "mile repeat" is not "1600m".
```

---

## Affected Files

| File | Change |
|------|--------|
| `src/server/db/schema.ts` | Add `display_unit` to `IntervalSpec` type |
| `src/server/extraction/schema.ts` | Add `display_unit` to `IntervalSpecZ` |
| `src/lib/format.ts` | Add `formatIntervalDistance`, update `formatIntervalSummary` |
| `src/lib/__tests__/format.test.ts` | Tests for `formatIntervalDistance` |
| `src/server/extraction/runtime.ts` | Update `EXTRACTION_SYSTEM_PROMPT` |
| `src/server/coach/tools/plans.ts` | Extend tool schema, `UpsertOp` type, handler |
| `src/server/coach/system-prompt.ts` | Add interval distance guidance |
| `src/components/workouts/workout-detail-sheet.tsx` | Use `formatIntervalDistance`, re-enable intervals |
| `src/app/(app)/today/hero-workout.tsx` | Use `formatIntervalDistance`, re-enable intervals |
| `src/app/(app)/plans/[id]/plan-detail.module.scss` | Revert any interval hiding |
| `src/app/(app)/today/today.module.scss` | Revert any interval hiding |

## Out of Scope

- Migrating existing extracted plan rows to back-fill `display_unit` (old data falls to heuristic)
- Changing how pace or HR targets are expressed
- Any changes to the mileage chart or plan stats (those use total workout distance, not interval distances)
