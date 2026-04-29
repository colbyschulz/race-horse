# Phase 6: Plan Detail View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Branch policy:** This phase is implemented directly on `master` (per user instruction — no feature branch).
>
> **Commit policy override:** the user drives all commits. Implementer subagents should NOT run `git commit`. Leave changes staged or unstaged at the end of each task and report what's ready.

**Goal:** Add a per-plan detail page at `/plans/[id]` that lets the user explore any training plan (active, archived, or upcoming) at a higher level than the week view — stats, mileage chart, full week-by-week grid, and a shared workout-detail sheet for drill-in. Also rename `/calendar` → `/training`, move plan-level actions into the detail page, and make the coach plan-route aware.

**Architecture:** Server component fetches the plan and its workouts; thin client wrapper owns the day-sheet open state. Mileage chart is computed client-side from existing `distance_meters`. No schema changes. The shared `WorkoutDetailSheet` is built and wired only on plan detail in this phase — Training/Today wiring is deferred.

**Tech Stack:** Next.js 16 App Router (server + client components), Drizzle ORM (Neon HTTP driver, no transactions), SCSS Modules using `--color-*`, `--space-*`, `--font-*` tokens from `src/styles/tokens.scss`. Vitest for unit tests, @testing-library/react for component tests.

**Design source:** `docs/design/project/Race Horse Hi-Fi.html` — `CalendarWeekA` (lines ~505–565) for the 7-cell day grid pattern; `HeroWorkout` stat-row pattern from `src/app/(app)/today/HeroWorkout.tsx` for the stats card and sheet.

**Spec:** `docs/superpowers/specs/2026-04-26-phase-6-plan-detail-design.md`

---

## File structure

**Create:**

- `src/plans/planStats.ts` — pure functions: `computePlanStats(workouts, units)` and `weeklyMileage(workouts, units)`.
- `src/plans/__tests__/planStats.test.ts`
- Extend `src/plans/dateQueries.ts` with `getWorkoutsForPlan(planId)`.
- `src/components/workouts/WorkoutDetailSheet.tsx` + `.module.scss` + `__tests__/WorkoutDetailSheet.test.tsx`
- `src/app/(app)/plans/[id]/page.tsx` (server)
- `src/app/(app)/plans/[id]/PlanDetailClient.tsx` (client wrapper)
- `src/app/(app)/plans/[id]/PlanHeader.tsx` (client — has action handlers)
- `src/app/(app)/plans/[id]/PlanStats.tsx` (server-friendly)
- `src/app/(app)/plans/[id]/MileageChart.tsx` (client)
- `src/app/(app)/plans/[id]/WeekGrid.tsx` (server-friendly presentational; takes onDayClick prop)
- `src/app/(app)/plans/[id]/PlanDetail.module.scss`
- `src/app/(app)/training/` (renamed from `src/app/(app)/calendar/`)

**Modify:**

- `src/components/layout/NavLinks.tsx` — change `Calendar`/`/calendar` → `Training`/`/training`.
- `src/coach/context.ts` — extend `routeLabel()` to recognize `/training` and `/plans/<uuid>` and `/plans/<uuid>/<YYYY-MM-DD>` patterns.
- `src/app/(app)/plans/PlansPageClient.tsx` — make plan cards full-card links to `/plans/[id]`, remove inline action buttons.
- `src/components/plans/ActivePlanCard.tsx` — remove action handlers from props/UI; add `<Link>` wrapper.
- `src/components/plans/ArchivedPlanCard.tsx` — same.
- `src/components/coach/ContextPill.tsx` (if route logic lives here) — recognize new patterns. (Verify — may already pull from `routeLabel`.)

**Delete:**

- The contents of `src/app/(app)/calendar/` after moving to `/training/`.

---

## Workout detail sheet contract

Sheet rendered as a fixed bottom-anchored panel with a backdrop. Closes on backdrop click, ESC key, or close button. Renders the same vocabulary as `HeroWorkout`:

- Header: `<WorkoutBadge type={...} />` + display headline (TYPE_HEADLINE map) + day label (`formatLongDate(date)`)
- Stat row: distance / duration / pace (or power for bike), display font numbers, vertical dividers
- Intensity panels: present `t.pace`, `t.hr` (zone or min/max bpm), `t.rpe`, `t.power.min/max` if present
- Intervals (if `workout.intervals`): one row per `IntervalSpec` — "5 × 1 km @ 4:00–4:10 / 90s rest"
- Notes block (if `workout.notes`)
- Footer: `<Link href={`/coach?from=/plans/${planId}/${workout.date}`}>Ask coach about this workout</Link>`

---

## Task 1: getWorkoutsForPlan query

**Files:**

- Modify: `src/plans/dateQueries.ts`
- Modify: `src/plans/__tests__/dateQueries.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/plans/__tests__/dateQueries.test.ts`:

```ts
// ---------- getWorkoutsForPlan ----------

describe("getWorkoutsForPlan", () => {
  it("returns rows for the given plan_id, ordered by date asc", async () => {
    const rows = [
      { id: "w1", plan_id: "p1", date: "2026-04-21", type: "easy" },
      { id: "w2", plan_id: "p1", date: "2026-04-22", type: "tempo" },
    ];
    fromChain.orderBy.mockResolvedValueOnce(rows);
    const { getWorkoutsForPlan } = await import("../dateQueries");
    const result = await getWorkoutsForPlan("p1");
    expect(result).toEqual(rows);
    expect(eq).toHaveBeenCalledWith(expect.anything(), "p1");
  });
});
```

- [ ] **Step 2: Run, expect failure** (`getWorkoutsForPlan is not a function`).

```bash
npx vitest run src/plans/__tests__/dateQueries.test.ts
```

- [ ] **Step 3: Implement**

Append to `src/plans/dateQueries.ts`:

```ts
export async function getWorkoutsForPlan(planId: string): Promise<WorkoutRow[]> {
  return db.select().from(workouts).where(eq(workouts.plan_id, planId)).orderBy(asc(workouts.date));
}
```

- [ ] **Step 4: Run, expect pass.** Stage.

---

## Task 2: planStats utilities

**Files:**

- Create: `src/plans/planStats.ts`
- Create: `src/plans/__tests__/planStats.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// src/plans/__tests__/planStats.test.ts
import { describe, it, expect } from "vitest";
import { computePlanStats, weeklyMileage } from "../planStats";

const w = (date: string, distance_meters: number | null, duration_seconds: number | null = null) =>
  ({
    date,
    distance_meters: distance_meters == null ? null : String(distance_meters),
    duration_seconds,
    type: "easy",
  }) as never;

describe("weeklyMileage", () => {
  it("buckets workouts into weeks (Mon-anchored)", () => {
    const workouts = [
      w("2026-04-20", 5000), // Mon
      w("2026-04-21", 8000),
      w("2026-04-27", 10000), // next Mon
    ];
    const result = weeklyMileage(workouts, "mi");
    expect(result).toEqual([
      { mondayIso: "2026-04-20", miles: 13000 / 1609.344 },
      { mondayIso: "2026-04-27", miles: 10000 / 1609.344 },
    ]);
  });
  it("returns [] for no workouts", () => {
    expect(weeklyMileage([], "mi")).toEqual([]);
  });
  it("works in km", () => {
    const workouts = [w("2026-04-20", 10000)];
    const result = weeklyMileage(workouts, "km");
    expect(result[0].miles).toBeCloseTo(10);
  });
});

describe("computePlanStats", () => {
  it("totals, peak week, longest run, weeks count", () => {
    const workouts = [
      w("2026-04-20", 5000),
      w("2026-04-21", 8000),
      w("2026-04-27", 32000), // longest run, peak week
      w("2026-05-04", 6000),
    ];
    const stats = computePlanStats(workouts, "mi");
    expect(stats.totalDistance).toBeCloseTo(51000 / 1609.344);
    expect(stats.peakWeek.distance).toBeCloseTo(32000 / 1609.344);
    expect(stats.peakWeek.mondayIso).toBe("2026-04-27");
    expect(stats.longestRun.distance).toBeCloseTo(32000 / 1609.344);
    expect(stats.longestRun.dateIso).toBe("2026-04-27");
    expect(stats.weeksCount).toBe(3);
  });
  it("handles empty plan", () => {
    const stats = computePlanStats([], "mi");
    expect(stats).toEqual({
      totalDistance: 0,
      peakWeek: null,
      longestRun: null,
      weeksCount: 0,
    });
  });
  it("ignores null distance workouts (rest days)", () => {
    const workouts = [w("2026-04-20", null), w("2026-04-21", 5000)];
    const stats = computePlanStats(workouts, "mi");
    expect(stats.totalDistance).toBeCloseTo(5000 / 1609.344);
    expect(stats.longestRun?.distance).toBeCloseTo(5000 / 1609.344);
  });
});
```

- [ ] **Step 2: Run, expect failure.**

```bash
npx vitest run src/plans/__tests__/planStats.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/plans/planStats.ts
import { mondayOf } from "@/lib/dates";
import type { WorkoutRow } from "./dateQueries";

export interface WeeklyMileage {
  mondayIso: string;
  miles: number;
}

export interface PlanStats {
  totalDistance: number;
  peakWeek: { mondayIso: string; distance: number } | null;
  longestRun: { dateIso: string; distance: number } | null;
  weeksCount: number;
}

function metersToUnits(m: number, units: "mi" | "km"): number {
  return units === "mi" ? m / 1609.344 : m / 1000;
}

export function weeklyMileage(workouts: WorkoutRow[], units: "mi" | "km"): WeeklyMileage[] {
  const buckets = new Map<string, number>();
  for (const w of workouts) {
    const meters = w.distance_meters == null ? 0 : Number(w.distance_meters);
    if (meters <= 0) continue;
    const monday = mondayOf(w.date);
    buckets.set(monday, (buckets.get(monday) ?? 0) + meters);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([mondayIso, totalMeters]) => ({
      mondayIso,
      miles: metersToUnits(totalMeters, units),
    }));
}

export function computePlanStats(workouts: WorkoutRow[], units: "mi" | "km"): PlanStats {
  if (workouts.length === 0) {
    return { totalDistance: 0, peakWeek: null, longestRun: null, weeksCount: 0 };
  }
  const totalMeters = workouts.reduce(
    (s, w) => s + (w.distance_meters == null ? 0 : Number(w.distance_meters)),
    0
  );
  const weekly = weeklyMileage(workouts, units);
  const peak = weekly.reduce<WeeklyMileage | null>(
    (best, w) => (best == null || w.miles > best.miles ? w : best),
    null
  );
  let longest: { dateIso: string; meters: number } | null = null;
  for (const w of workouts) {
    if (w.distance_meters == null) continue;
    const m = Number(w.distance_meters);
    if (longest == null || m > longest.meters) longest = { dateIso: w.date, meters: m };
  }
  return {
    totalDistance: metersToUnits(totalMeters, units),
    peakWeek: peak ? { mondayIso: peak.mondayIso, distance: peak.miles } : null,
    longestRun: longest
      ? { dateIso: longest.dateIso, distance: metersToUnits(longest.meters, units) }
      : null,
    weeksCount: weekly.length,
  };
}
```

- [ ] **Step 4: Run, expect pass.** Stage.

---

## Task 3: Rename `/calendar` → `/training`

**Files:**

- Move: `src/app/(app)/calendar/` → `src/app/(app)/training/`
- Modify: `src/components/layout/NavLinks.tsx`
- Modify: `src/coach/context.ts`

- [ ] **Step 1: Move the directory**

```bash
git mv src/app/\(app\)/calendar src/app/\(app\)/training
```

- [ ] **Step 2: Update NavLinks**

In `src/components/layout/NavLinks.tsx`, change the `LINKS` array:

```tsx
const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/training", label: "Training" },
  { href: "/plans", label: "Plans" },
  { href: "/settings", label: "Settings" },
] as const;
```

- [ ] **Step 3: Update coach context route labels**

In `src/coach/context.ts`, update `ROUTE_LABELS`:

```ts
const ROUTE_LABELS: Record<string, string> = {
  "/today": "Today view",
  "/training": "Training view (week agenda)",
  "/plans": "Plans / manage page",
  "/settings": "Settings page",
  "/coach": "Coach chat",
};
```

- [ ] **Step 4: Verify any internal links still resolve**

Search for references to `/calendar`:

```bash
grep -rn "/calendar" src/ --include="*.ts" --include="*.tsx"
```

Replace any remaining references with `/training`. Inside `src/app/(app)/training/CalendarClient.tsx`, replace any `prevHref="/calendar?week=..."` with `/training?week=...`.

- [ ] **Step 5: Run tests + tsc**

```bash
npx tsc --noEmit
npx vitest run
```

Both must pass. Stage.

---

## Task 4: Coach context — plan-route awareness

**Files:**

- Modify: `src/coach/context.ts`
- Modify: `src/coach/__tests__/context.test.ts` (if exists; otherwise add)

- [ ] **Step 1: Failing test**

Find or create `src/coach/__tests__/context.test.ts`. Add:

```ts
import { describe, it, expect } from "vitest";
import { routeLabel } from "../context";

describe("routeLabel", () => {
  it("labels plan detail routes with the plan id", () => {
    expect(routeLabel("/plans/3f2c4a91-aa11-4cb1-9f2d-12345678abcd")).toBe(
      "Plan detail (plan id: 3f2c4a91-aa11-4cb1-9f2d-12345678abcd)"
    );
  });
  it("labels plan workout drill-in routes with id and date", () => {
    expect(routeLabel("/plans/3f2c4a91-aa11-4cb1-9f2d-12345678abcd/2026-05-04")).toBe(
      "Workout detail (plan id: 3f2c4a91-aa11-4cb1-9f2d-12345678abcd, date: 2026-05-04)"
    );
  });
  it("returns null for unknown routes", () => {
    expect(routeLabel("/random")).toBeNull();
  });
  it("still labels static routes", () => {
    expect(routeLabel("/today")).toBe("Today view");
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run src/coach/__tests__/context.test.ts
```

- [ ] **Step 3: Implement**

In `src/coach/context.ts`, replace the `routeLabel` function:

```ts
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAN_DETAIL_RE = new RegExp(`^/plans/(${UUID})$`);
const WORKOUT_DETAIL_RE = new RegExp(`^/plans/(${UUID})/(\\d{4}-\\d{2}-\\d{2})$`);

export function routeLabel(from: string | undefined | null): string | null {
  if (!from) return null;
  const wmatch = from.match(WORKOUT_DETAIL_RE);
  if (wmatch) {
    return `Workout detail (plan id: ${wmatch[1]}, date: ${wmatch[2]})`;
  }
  const pmatch = from.match(PLAN_DETAIL_RE);
  if (pmatch) {
    return `Plan detail (plan id: ${pmatch[1]})`;
  }
  return ROUTE_LABELS[from] ?? null;
}
```

- [ ] **Step 4: Run, expect pass.**

```bash
npx vitest run src/coach/__tests__/context.test.ts
```

Stage.

---

## Task 5: WorkoutDetailSheet component

**Files:**

- Create: `src/components/workouts/WorkoutDetailSheet.tsx`
- Create: `src/components/workouts/WorkoutDetailSheet.module.scss`
- Create: `src/components/workouts/__tests__/WorkoutDetailSheet.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/components/workouts/__tests__/WorkoutDetailSheet.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkoutDetailSheet } from "../WorkoutDetailSheet";

const w = {
  id: "w1",
  plan_id: "p1",
  date: "2026-04-25",
  sport: "run",
  type: "tempo",
  distance_meters: "12000",
  duration_seconds: 3600,
  target_intensity: { pace: { min_seconds_per_km: 240, max_seconds_per_km: 250 }, rpe: 7 },
  intervals: null,
  notes: "Hold steady tempo. Last 2km strong.",
} as never;

describe("WorkoutDetailSheet", () => {
  it("renders nothing when workout is null", () => {
    const { container } = render(
      <WorkoutDetailSheet workout={null} planId="p1" units="mi" onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
  it("renders headline + day label + notes when workout provided", () => {
    render(<WorkoutDetailSheet workout={w} planId="p1" units="mi" onClose={() => {}} />);
    expect(screen.getByText("Tempo Run")).toBeInTheDocument();
    expect(screen.getByText(/Saturday, April 25/)).toBeInTheDocument();
    expect(screen.getByText(/Hold steady tempo/)).toBeInTheDocument();
  });
  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(<WorkoutDetailSheet workout={w} planId="p1" units="mi" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
  it("links Ask coach to /coach?from=/plans/<id>/<date>", () => {
    render(<WorkoutDetailSheet workout={w} planId="p1" units="mi" onClose={() => {}} />);
    const link = screen.getByRole("link", { name: /Ask coach/ });
    expect(link).toHaveAttribute("href", "/coach?from=%2Fplans%2Fp1%2F2026-04-25");
  });
});
```

- [ ] **Step 2: Run, expect failure.**

```bash
npx vitest run src/components/workouts/__tests__/WorkoutDetailSheet.test.tsx
```

- [ ] **Step 3: Implement**

```tsx
// src/components/workouts/WorkoutDetailSheet.tsx
"use client";
import { useEffect } from "react";
import Link from "next/link";
import { WorkoutBadge } from "./WorkoutBadge";
import { formatLongDate } from "@/lib/dates";
import type { WorkoutRow } from "@/plans/dateQueries";
import type { TargetIntensity, IntervalSpec } from "@/db/schema";
import styles from "./WorkoutDetailSheet.module.scss";

const TYPE_HEADLINE: Record<string, string> = {
  easy: "Easy Run",
  long: "Long Run",
  tempo: "Tempo Run",
  threshold: "Threshold",
  intervals: "Intervals",
  recovery: "Recovery",
  race: "Race Day",
  rest: "Rest",
  cross: "Cross Train",
};

function fmtDist(meters: string | null | undefined, units: "mi" | "km"): string {
  if (meters == null) return "—";
  return (Number(meters) / (units === "mi" ? 1609.344 : 1000)).toFixed(1);
}
function fmtDur(s: number | null | undefined): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
function fmtPace(secPerKm: number, units: "mi" | "km"): string {
  const sec = units === "mi" ? Math.round(secPerKm * 1.609344) : Math.round(secPerKm);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
function fmtPaceRange(
  p: { min_seconds_per_km?: number; max_seconds_per_km?: number },
  units: "mi" | "km"
): string {
  const min = p.min_seconds_per_km != null ? fmtPace(p.min_seconds_per_km, units) : "";
  const max = p.max_seconds_per_km != null ? fmtPace(p.max_seconds_per_km, units) : "";
  return min && max ? `${min}–${max}` : min || max || "—";
}

interface Props {
  workout: WorkoutRow | null;
  planId: string;
  units: "mi" | "km";
  onClose: () => void;
}

export function WorkoutDetailSheet({ workout, planId, units, onClose }: Props) {
  useEffect(() => {
    if (!workout) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [workout, onClose]);

  if (!workout) return null;
  const t = (workout.target_intensity ?? {}) as TargetIntensity;
  const intervals = (workout.intervals ?? null) as IntervalSpec[] | null;
  const headline = TYPE_HEADLINE[workout.type] ?? workout.type;
  const coachHref = `/coach?from=${encodeURIComponent(`/plans/${planId}/${workout.date}`)}`;
  const paceText = t.pace ? fmtPaceRange(t.pace, units) : null;

  return (
    <>
      <div data-testid="sheet-backdrop" className={styles.backdrop} onClick={onClose} />
      <div role="dialog" aria-label={`${headline} on ${workout.date}`} className={styles.sheet}>
        <div className={styles.header}>
          <WorkoutBadge type={workout.type} />
          <h2 className={styles.headline}>{headline}</h2>
          <p className={styles.day}>{formatLongDate(workout.date)}</p>
        </div>

        <div className={styles.statRow}>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {fmtDist(workout.distance_meters as string | null, units)}
            </span>
            <span className={styles.statUnit}>{units}</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statValue}>{fmtDur(workout.duration_seconds)}</span>
            <span className={styles.statUnit}>time</span>
          </div>
          {paceText && (
            <>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statValue}>{paceText}</span>
                <span className={styles.statUnit}>/{units}</span>
              </div>
            </>
          )}
        </div>

        {(t.pace || t.hr || t.rpe != null || t.power) && (
          <div className={styles.intensityRow}>
            {t.pace && (
              <div className={styles.intensityCell}>
                <span className={styles.lbl}>Pace</span>
                <span className={styles.val}>{paceText ?? "—"}</span>
              </div>
            )}
            {t.hr && (
              <div className={styles.intensityCell}>
                <span className={styles.lbl}>HR</span>
                <span className={styles.val}>
                  {"zone" in t.hr ? t.hr.zone : `${t.hr.min_bpm ?? ""}–${t.hr.max_bpm ?? ""}`}
                </span>
              </div>
            )}
            {t.rpe != null && (
              <div className={styles.intensityCell}>
                <span className={styles.lbl}>RPE</span>
                <span className={styles.val}>{t.rpe}/10</span>
              </div>
            )}
            {t.power && (
              <div className={styles.intensityCell}>
                <span className={styles.lbl}>Power</span>
                <span
                  className={styles.val}
                >{`${t.power.min_watts ?? ""}–${t.power.max_watts ?? ""} W`}</span>
              </div>
            )}
          </div>
        )}

        {intervals && intervals.length > 0 && (
          <div className={styles.intervals}>
            <h3 className={styles.h3}>Intervals</h3>
            <ul className={styles.intervalList}>
              {intervals.map((iv, i) => (
                <li key={i} className={styles.intervalRow}>
                  {iv.reps} ×{" "}
                  {iv.distance_m != null
                    ? `${(iv.distance_m / (units === "mi" ? 1609.344 : 1000)).toFixed(2)} ${units}`
                    : null}
                  {iv.duration_s != null ? `${fmtDur(iv.duration_s)}` : null}
                  {iv.target_intensity?.pace
                    ? ` @ ${fmtPaceRange(iv.target_intensity.pace, units)}`
                    : null}
                  {iv.rest?.duration_s != null ? ` / ${fmtDur(iv.rest.duration_s)} rest` : null}
                  {iv.rest?.distance_m != null
                    ? ` / ${(iv.rest.distance_m / (units === "mi" ? 1609.344 : 1000)).toFixed(2)} ${units} rest`
                    : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {workout.notes && <p className={styles.notes}>{workout.notes}</p>}

        <div className={styles.footer}>
          <Link href={coachHref} className={styles.askCoach}>
            Ask coach about this workout →
          </Link>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: SCSS**

```scss
// src/components/workouts/WorkoutDetailSheet.module.scss
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
}
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 101;
  background: var(--color-bg-surface);
  border-top-left-radius: var(--radius-lg);
  border-top-right-radius: var(--radius-lg);
  padding: var(--space-6) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-height: 88dvh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
  @media (min-width: 768px) {
    left: 50%;
    right: auto;
    bottom: 50%;
    transform: translate(-50%, 50%);
    border-radius: var(--radius-lg);
    width: min(560px, calc(100vw - var(--space-8) * 2));
    max-height: min(720px, 88dvh);
  }
}
.header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.headline {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
  margin: 0;
  color: var(--color-fg-primary);
}
.day {
  font-size: 0.8125rem;
  color: var(--color-fg-tertiary);
  margin: 0;
}
.statRow {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  flex-wrap: wrap;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.statValue {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--color-fg-primary);
}
.statUnit {
  font-size: 0.6875rem;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.statDivider {
  width: 1px;
  height: 36px;
  background: var(--color-border-default);
}
.intensityRow {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.intensityCell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-md);
  min-width: 80px;
}
.lbl {
  font-size: 0.6875rem;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.val {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-fg-primary);
}
.intervals {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.h3 {
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-fg-tertiary);
  margin: 0;
}
.intervalList {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.intervalRow {
  font-size: 0.875rem;
  color: var(--color-fg-secondary);
}
.notes {
  font-size: 0.9375rem;
  color: var(--color-fg-secondary);
  line-height: 1.5;
  margin: 0;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border-subtle);
}
.askCoach {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-brown);
  text-decoration: none;
}
.closeBtn {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-fg-secondary);
  background: transparent;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  &:hover {
    border-color: var(--color-brown);
    color: var(--color-brown);
  }
}
```

- [ ] **Step 5: Run tests, expect pass.**

```bash
npx vitest run src/components/workouts/__tests__/WorkoutDetailSheet.test.tsx
```

Stage.

---

## Task 6: Plan detail page — server scaffold + 404/auth

**Files:**

- Create: `src/app/(app)/plans/[id]/page.tsx`
- Create: `src/app/(app)/plans/[id]/PlanDetail.module.scss`

- [ ] **Step 1: Page scaffold**

```tsx
// src/app/(app)/plans/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getPlanById } from "@/plans/queries";
import { getWorkoutsForPlan } from "@/plans/dateQueries";
import { todayIso } from "@/lib/dates";
import { PlanDetailClient } from "./PlanDetailClient";

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const { id } = await params;

  const plan = await getPlanById(id, userId);
  if (!plan) notFound();

  const workouts = await getWorkoutsForPlan(plan.id);
  const [pref] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";
  const today = todayIso();

  return <PlanDetailClient plan={plan} workouts={workouts} units={units} today={today} />;
}
```

- [ ] **Step 2: Stub PlanDetailClient (will fill in next tasks)**

```tsx
// src/app/(app)/plans/[id]/PlanDetailClient.tsx
"use client";
import type { Plan } from "@/plans/types";
import type { WorkoutRow } from "@/plans/dateQueries";

interface Props {
  plan: Plan;
  workouts: WorkoutRow[];
  units: "mi" | "km";
  today: string;
}

export function PlanDetailClient({ plan, workouts }: Props) {
  return (
    <div>
      <h1>{plan.title}</h1>
      <p>{workouts.length} workouts</p>
    </div>
  );
}
```

- [ ] **Step 3: Empty SCSS placeholder**

```scss
// src/app/(app)/plans/[id]/PlanDetail.module.scss
.page {
  display: flex;
  flex-direction: column;
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  gap: var(--space-6);
}
```

- [ ] **Step 4: tsc + visit /plans/<a-real-plan-id>**

```bash
npx tsc --noEmit
```

Visit `/plans/<id>` in dev — should render plan title + workout count. `/plans/00000000-0000-0000-0000-000000000000` should 404. Stage.

---

## Task 7: PlanHeader

**Files:**

- Create: `src/app/(app)/plans/[id]/PlanHeader.tsx`
- Modify: `src/app/(app)/plans/[id]/PlanDetail.module.scss`

- [ ] **Step 1: Implement PlanHeader**

```tsx
// src/app/(app)/plans/[id]/PlanHeader.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Plan } from "@/plans/types";
import styles from "./PlanDetail.module.scss";

function formatDateRange(start: string, end: string | null): string {
  if (!end) return `${start} · indefinite`;
  return `${start} – ${end}`;
}

function statusOf(plan: Plan, today: string): "active" | "upcoming" | "archived" {
  if (plan.is_active) return "active";
  if (plan.start_date > today) return "upcoming";
  return "archived";
}

interface Props {
  plan: Plan;
  today: string;
}

export function PlanHeader({ plan, today }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const status = statusOf(plan, today);

  async function patch(body: { is_active: boolean }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
      startTransition(() => router.refresh());
    } catch (err) {
      console.error(err);
      alert("Action failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!confirm(`Delete "${plan.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      router.push("/plans");
    } catch (err) {
      console.error(err);
      alert("Delete failed — please try again.");
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>{plan.title}</h1>
        <p className={styles.subline}>
          {plan.sport} · {formatDateRange(plan.start_date, plan.end_date)} · {plan.mode}
        </p>
      </div>
      <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
        {status === "active" ? "Active" : status === "upcoming" ? "Upcoming" : "Archived"}
      </span>
      <div className={styles.actions}>
        {status !== "active" && (
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={disabled}
            onClick={() => patch({ is_active: true })}
          >
            Set active
          </button>
        )}
        {status === "active" && (
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={disabled}
            onClick={() => patch({ is_active: false })}
          >
            Archive
          </button>
        )}
        <button type="button" className={styles.btnDanger} disabled={disabled} onClick={destroy}>
          Delete
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Add SCSS**

Append to `src/app/(app)/plans/[id]/PlanDetail.module.scss`:

```scss
.header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border-subtle);
}
.titleBlock {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.title {
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 5vw, 2.25rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--color-fg-primary);
  margin: 0;
}
.subline {
  font-size: 0.875rem;
  color: var(--color-fg-tertiary);
  margin: 0;
  text-transform: capitalize;
}
.statusBadge {
  align-self: flex-start;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
}
.status_active {
  background: var(--color-brown);
  color: #fff;
}
.status_upcoming {
  background: color-mix(in srgb, var(--color-terra) 18%, transparent);
  color: var(--color-terra);
}
.status_archived {
  background: var(--color-bg-subtle);
  color: var(--color-fg-tertiary);
}
.actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.btnPrimary,
.btnSecondary,
.btnDanger {
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 600;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  cursor: pointer;
  border: 1px solid transparent;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.btnPrimary {
  background: var(--color-brown);
  color: #fff;
  &:hover:not(:disabled) {
    background: var(--color-brown-hover);
  }
}
.btnSecondary {
  background: transparent;
  color: var(--color-fg-primary);
  border-color: var(--color-border-default);
  &:hover:not(:disabled) {
    border-color: var(--color-brown);
    color: var(--color-brown);
  }
}
.btnDanger {
  background: transparent;
  color: var(--color-fg-secondary);
  border-color: var(--color-border-default);
  &:hover:not(:disabled) {
    border-color: #b83232;
    color: #b83232;
  }
}
```

- [ ] **Step 3: Wire into PlanDetailClient**

```tsx
// src/app/(app)/plans/[id]/PlanDetailClient.tsx
"use client";
import type { Plan } from "@/plans/types";
import type { WorkoutRow } from "@/plans/dateQueries";
import { PlanHeader } from "./PlanHeader";
import styles from "./PlanDetail.module.scss";

interface Props {
  plan: Plan;
  workouts: WorkoutRow[];
  units: "mi" | "km";
  today: string;
}

export function PlanDetailClient({ plan, today }: Props) {
  return (
    <div className={styles.page}>
      <PlanHeader plan={plan} today={today} />
    </div>
  );
}
```

- [ ] **Step 4: tsc + visit page.** Stage.

---

## Task 8: PlanStats card

**Files:**

- Create: `src/app/(app)/plans/[id]/PlanStats.tsx`
- Modify: `src/app/(app)/plans/[id]/PlanDetail.module.scss`
- Modify: `src/app/(app)/plans/[id]/PlanDetailClient.tsx`

- [ ] **Step 1: Implement PlanStats**

```tsx
// src/app/(app)/plans/[id]/PlanStats.tsx
import { computePlanStats } from "@/plans/planStats";
import { formatDayLabel } from "@/lib/dates";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./PlanDetail.module.scss";

interface Props {
  workouts: WorkoutRow[];
  units: "mi" | "km";
}

export function PlanStats({ workouts, units }: Props) {
  const s = computePlanStats(workouts, units);
  return (
    <section className={styles.statsCard}>
      <Stat label="Total" value={`${s.totalDistance.toFixed(1)} ${units}`} />
      <div className={styles.statsDivider} />
      <Stat
        label="Peak week"
        value={s.peakWeek ? `${s.peakWeek.distance.toFixed(1)} ${units}` : "—"}
        sub={s.peakWeek ? formatDayLabel(s.peakWeek.mondayIso) : undefined}
      />
      <div className={styles.statsDivider} />
      <Stat
        label="Longest run"
        value={s.longestRun ? `${s.longestRun.distance.toFixed(1)} ${units}` : "—"}
        sub={s.longestRun ? formatDayLabel(s.longestRun.dateIso) : undefined}
      />
      <div className={styles.statsDivider} />
      <Stat label="Weeks" value={String(s.weeksCount)} />
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={styles.statBlock}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}
```

- [ ] **Step 2: SCSS append**

```scss
.statsCard {
  display: flex;
  align-items: stretch;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-5);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  flex-wrap: wrap;
}
.statBlock {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 96px;
}
.statLabel {
  font-size: 0.6875rem;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 600;
}
.statValue {
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-fg-primary);
}
.statSub {
  font-size: 0.75rem;
  color: var(--color-fg-tertiary);
}
.statsDivider {
  width: 1px;
  background: var(--color-border-subtle);
}
```

- [ ] **Step 3: Wire into client**

```tsx
import { PlanStats } from "./PlanStats";
// ...inside JSX, after <PlanHeader />:
<PlanStats workouts={workouts} units={units} />;
```

- [ ] **Step 4: Verify in browser. Stage.**

---

## Task 9: WeekGrid component

**Files:**

- Create: `src/app/(app)/plans/[id]/WeekGrid.tsx`
- Modify: `src/app/(app)/plans/[id]/PlanDetail.module.scss`

- [ ] **Step 1: Implement**

```tsx
// src/app/(app)/plans/[id]/WeekGrid.tsx
"use client";
import { addDays, formatDayLabel } from "@/lib/dates";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./PlanDetail.module.scss";

const TYPE_LABEL: Record<string, string> = {
  easy: "Easy",
  long: "Long",
  tempo: "Tempo",
  threshold: "Thresh",
  intervals: "Int.",
  recovery: "Recov.",
  race: "Race",
  rest: "Rest",
  cross: "Cross",
};

function fmtMiles(m: string | null | undefined, units: "mi" | "km"): string {
  if (m == null) return "";
  return (Number(m) / (units === "mi" ? 1609.344 : 1000)).toFixed(1);
}

interface Props {
  monday: string;
  weekTotalMeters: number;
  weekTotalSeconds: number;
  byDate: Map<string, WorkoutRow>;
  today: string;
  isActivePlan: boolean;
  units: "mi" | "km";
  onDayClick: (date: string) => void;
}

export function WeekGrid({
  monday,
  weekTotalMeters,
  weekTotalSeconds,
  byDate,
  today,
  isActivePlan,
  units,
  onDayClick,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const totalDist = (weekTotalMeters / (units === "mi" ? 1609.344 : 1000)).toFixed(1);
  const h = Math.floor(weekTotalSeconds / 3600);
  const m = Math.floor((weekTotalSeconds % 3600) / 60);
  const totalDur = h > 0 ? `${h}h ${m}m` : `${m}m`;

  return (
    <section className={styles.week} id={`week-${monday}`}>
      <div className={styles.weekHeader}>
        <span className={styles.weekRange}>
          {formatDayLabel(monday)} – {formatDayLabel(addDays(monday, 6))}
        </span>
        <span className={styles.weekTotal}>
          {totalDist} {units} · {totalDur}
        </span>
      </div>
      <div className={styles.weekGrid}>
        {days.map((d) => {
          const w = byDate.get(d);
          const isToday = isActivePlan && d === today;
          const isRest = !w || w.type === "rest";
          const distLabel = w ? fmtMiles(w.distance_meters as string | null, units) : "";
          return (
            <button
              key={d}
              type="button"
              className={`${styles.dayCell} ${isToday ? styles.dayCellToday : ""}`}
              onClick={() => w && onDayClick(d)}
              disabled={!w}
            >
              {w && !isRest && (
                <span className={`${styles.dayStripe} ${styles[`stripe_${w.type}`]}`} />
              )}
              <span className={styles.dayDate}>{d.slice(-2)}</span>
              {w && !isRest && (
                <span className={`${styles.dayType} ${styles[`type_${w.type}`]}`}>
                  {TYPE_LABEL[w.type]}
                </span>
              )}
              {distLabel && (
                <span className={styles.dayDist}>
                  {distLabel}
                  <small>{units}</small>
                </span>
              )}
              {isRest && <span className={styles.dayRest}>Rest</span>}
              {isToday && <span className={styles.dayNow}>now</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: SCSS append**

```scss
.week {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.weekHeader {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-family: var(--font-body);
}
.weekRange {
  font-family: var(--font-display);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-fg-primary);
}
.weekTotal {
  font-size: 0.75rem;
  color: var(--color-fg-tertiary);
}
.weekGrid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
}
.dayCell {
  position: relative;
  appearance: none;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 78px;
  padding: 6px 6px 5px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
  &:hover:not(:disabled) {
    border-color: var(--color-brown-mid);
  }
}
.dayCellToday {
  border: 2px solid var(--color-brown) !important;
  background: var(--color-brown-subtle);
  padding: 5px 5px 4px;
}
.dayStripe {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}
.dayDate {
  font-size: 11px;
  color: var(--color-fg-tertiary);
  font-weight: 500;
}
.dayCellToday .dayDate {
  color: var(--color-brown);
  font-weight: 700;
}
.dayType {
  font-size: 9px;
  font-weight: 600;
  line-height: 1.2;
}
.dayDist {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  color: var(--color-fg-primary);
  small {
    font-family: var(--font-body);
    font-size: 9px;
    font-weight: 400;
    color: var(--color-fg-tertiary);
    margin-left: 2px;
  }
}
.dayRest {
  font-size: 10px;
  color: var(--color-fg-tertiary);
  margin-top: auto;
}
.dayNow {
  font-size: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-brown);
  margin-top: auto;
}
.stripe_easy,
.type_easy {
  background: var(--color-workout-easy);
  color: var(--color-workout-easy);
}
.stripe_long,
.type_long {
  background: var(--color-workout-long);
  color: var(--color-workout-long);
}
.stripe_tempo,
.type_tempo {
  background: var(--color-workout-tempo);
  color: var(--color-workout-tempo);
}
.stripe_threshold,
.type_threshold {
  background: var(--color-workout-threshold);
  color: var(--color-workout-threshold);
}
.stripe_intervals,
.type_intervals {
  background: var(--color-workout-intervals);
  color: var(--color-workout-intervals);
}
.stripe_recovery,
.type_recovery {
  background: var(--color-workout-recovery);
  color: var(--color-workout-recovery);
}
.stripe_race,
.type_race {
  background: var(--color-workout-race);
  color: var(--color-workout-race);
}
.stripe_cross,
.type_cross {
  background: var(--color-workout-recovery);
  color: var(--color-workout-recovery);
}
```

(The `.stripe_*` classes set `background`; `.type_*` use the same color for the text label — CSS deduplicates because each class only sets two properties and the consumer uses one or the other.)

- [ ] **Step 3: Wire into PlanDetailClient with stacked weeks + sheet state**

```tsx
"use client";
import { useMemo, useState } from "react";
import type { Plan } from "@/plans/types";
import type { WorkoutRow } from "@/plans/dateQueries";
import { mondayOf, addDays } from "@/lib/dates";
import { PlanHeader } from "./PlanHeader";
import { PlanStats } from "./PlanStats";
import { WeekGrid } from "./WeekGrid";
import { WorkoutDetailSheet } from "@/components/workouts/WorkoutDetailSheet";
import styles from "./PlanDetail.module.scss";

interface Props {
  plan: Plan;
  workouts: WorkoutRow[];
  units: "mi" | "km";
  today: string;
}

interface WeekBucket {
  monday: string;
  byDate: Map<string, WorkoutRow>;
  totalMeters: number;
  totalSeconds: number;
}

function bucketByWeek(workouts: WorkoutRow[]): WeekBucket[] {
  const map = new Map<string, WeekBucket>();
  for (const w of workouts) {
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

export function PlanDetailClient({ plan, workouts, units, today }: Props) {
  const weeks = useMemo(() => bucketByWeek(workouts), [workouts]);
  const byId = useMemo(() => new Map(workouts.map((w) => [w.date, w])), [workouts]);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const openWorkout = openDate ? (byId.get(openDate) ?? null) : null;

  return (
    <div className={styles.page}>
      <PlanHeader plan={plan} today={today} />
      <PlanStats workouts={workouts} units={units} />
      <div className={styles.weeks}>
        {weeks.map((wk) => (
          <WeekGrid
            key={wk.monday}
            monday={wk.monday}
            weekTotalMeters={wk.totalMeters}
            weekTotalSeconds={wk.totalSeconds}
            byDate={wk.byDate}
            today={today}
            isActivePlan={plan.is_active}
            units={units}
            onDayClick={setOpenDate}
          />
        ))}
      </div>
      <WorkoutDetailSheet
        workout={openWorkout}
        planId={plan.id}
        units={units}
        onClose={() => setOpenDate(null)}
      />
    </div>
  );
}
```

Append to SCSS:

```scss
.weeks {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
```

- [ ] **Step 4: tsc + visit page.** Verify clicking a day opens the sheet. Stage.

---

## Task 10: MileageChart

**Files:**

- Create: `src/app/(app)/plans/[id]/MileageChart.tsx`
- Modify: `src/app/(app)/plans/[id]/PlanDetail.module.scss`
- Modify: `src/app/(app)/plans/[id]/PlanDetailClient.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/(app)/plans/[id]/MileageChart.tsx
"use client";
import { weeklyMileage } from "@/plans/planStats";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./PlanDetail.module.scss";

interface Props {
  workouts: WorkoutRow[];
  units: "mi" | "km";
}

export function MileageChart({ workouts, units }: Props) {
  const weeks = weeklyMileage(workouts, units);
  if (weeks.length === 0) return null;
  const max = Math.max(...weeks.map((w) => w.miles));
  return (
    <div className={styles.chart}>
      {weeks.map((w) => {
        const ratio = max > 0 ? w.miles / max : 0;
        const heightPct = Math.max(8, Math.round(ratio * 100));
        const tint = Math.round(20 + ratio * 80);
        return (
          <a
            key={w.mondayIso}
            href={`#week-${w.mondayIso}`}
            className={styles.chartBar}
            title={`Week of ${w.mondayIso}: ${w.miles.toFixed(1)} ${units}`}
            aria-label={`Week of ${w.mondayIso}, ${w.miles.toFixed(1)} ${units}`}
            style={{
              height: `${heightPct}%`,
              background: `color-mix(in srgb, var(--color-brown) ${tint}%, var(--color-bg-subtle))`,
            }}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: SCSS**

```scss
.chart {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 64px;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border-subtle);
}
.chartBar {
  flex: 1;
  min-width: 6px;
  border-radius: var(--radius-sm);
  transition: opacity 120ms ease;
  cursor: pointer;
  &:hover {
    opacity: 0.85;
  }
}
```

- [ ] **Step 3: Wire into PlanDetailClient**

Add `<MileageChart workouts={workouts} units={units} />` between `<PlanStats />` and `<div className={styles.weeks}>`.

- [ ] **Step 4: Verify in browser.** Clicking a bar should jump to the corresponding week (the `id="week-<monday>"` on each `<WeekGrid>` provides the anchor target). Stage.

---

## Task 11: Plans-list cleanup

**Files:**

- Modify: `src/app/(app)/plans/PlansPageClient.tsx`
- Modify: `src/components/plans/ActivePlanCard.tsx`
- Modify: `src/components/plans/ArchivedPlanCard.tsx`

- [ ] **Step 1: Read current cards**

```bash
cat src/components/plans/ActivePlanCard.tsx src/components/plans/ArchivedPlanCard.tsx
```

Note current props (action handlers, busy state) so you can remove them cleanly.

- [ ] **Step 2: Strip actions, wrap in Link**

For `ActivePlanCard.tsx`:

- Remove `onArchive`, `onDelete`, `busy` props.
- Wrap the entire card root element in `<Link href={`/plans/${plan.id}`} className={styles.cardLink}>`.
- Remove the trailing button row JSX.

For `ArchivedPlanCard.tsx`: same pattern (remove `onRestore`, `onDelete`, `busy`).

Add to `Plans.module.scss`:

```scss
.cardLink {
  display: block;
  text-decoration: none;
  color: inherit;
}
.cardLink:hover {
  /* card hover handled by inner card class */
}
```

- [ ] **Step 3: Simplify PlansPageClient**

```tsx
"use client";

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

export function PlansPageClient({ plans, today }: Props) {
  const active = plans.find((p) => p.is_active) ?? null;
  const archived = plans.filter((p) => !p.is_active);

  return (
    <div className={styles.page}>
      <h1 className={styles.header}>Plans</h1>
      <PlanActionRow />
      {!active && archived.length === 0 && <PlansEmptyState />}
      {active && <ActivePlanCard plan={active} today={today} />}
      {archived.length > 0 && (
        <>
          <div className={styles.archivedLabel}>Archived</div>
          <div className={styles.archivedList}>
            {archived.map((p) => (
              <ArchivedPlanCard key={p.id} plan={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update tests**

```bash
grep -rn "onArchive\|onDelete\|onRestore\|busy=" src/components/plans/__tests__ src/app/\(app\)/plans/__tests__ 2>/dev/null
```

Remove handler-related assertions; add: clicking the card navigates to `/plans/${plan.id}` (assert `href` attribute).

- [ ] **Step 5: tsc + tests**

```bash
npx tsc --noEmit
npx vitest run
```

Stage.

---

## Task 12: Smoke test (operational)

- [ ] **Step 1: Dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify nav rename**

Open the app. Confirm the bottom tab bar / sidebar shows **Today / Training / Plans / Settings**. Click "Training" — confirm it loads `/training` and shows the week agenda from before.

- [ ] **Step 3: Visit `/plans`**

Confirm:

- Each plan card is now a single clickable link (no inline buttons).
- Empty state still shows when no plans.
- Hovering a card shows hover affordance.

- [ ] **Step 4: Visit `/plans/<id>` for an active plan**

Confirm:

- Title, sport, dates, mode, "Active" badge.
- Action row shows "Archive" and "Delete".
- Stats card shows total mileage, peak week, longest run, weeks count.
- Mileage chart renders one bar per week, gradient visible.
- Clicking a bar scrolls to the corresponding week below.
- Each week renders the 7-cell grid with type-color stripes.
- Today's cell has the brown border + "now" microcopy.
- Tap any day → workout detail sheet slides up. Backdrop dismisses, ESC dismisses.
- Sheet shows headline, stat row, intensity, intervals (if present), notes.
- "Ask coach about this workout" link goes to `/coach?from=/plans/<id>/<date>`. Open the coach — confirm the context pill shows the workout context.

- [ ] **Step 5: Visit `/plans/<id>` for an archived plan**

Same as active, but:

- Status badge says "Archived".
- Action row shows "Set active" + "Delete".
- No "now" indicator on any cell.

- [ ] **Step 6: 404**

Visit `/plans/00000000-0000-0000-0000-000000000000`. Confirm Next.js 404 page renders.

- [ ] **Step 7: Action smoke**

From an archived plan: click "Set active" → confirm refresh + "Active" badge.
Click "Delete" on any plan → confirm dialog → confirm redirect to `/plans` and plan gone.

---

## Self-review

Spec coverage:

- §3 Architecture — Tasks 6–10 (server scaffold, client wrapper, header, stats, week grid, mileage chart). ✓
- §4.1 Plan header (title/dates/status/actions) — Task 7. ✓
- §4.2 Stats card (4 numbers, no countdown) — Task 8 + Task 2 (`computePlanStats`). ✓
- §4.3 Mileage chart — Task 10. ✓
- §4.4 Stacked weeks — Task 9. ✓
- §4.5 Workout detail sheet — Task 5. ✓
- §5 Data flow — Task 6 (server fetch) + Task 9 (client buckets). ✓
- §7 Plan-list changes (cards become links, inline actions removed) — Task 11. ✓
- §8 Coach plan-context awareness — Task 4. ✓
- §10 Renames (`/calendar` → `/training`) — Task 3. ✓
- §11 Testing — Tasks 1, 2, 4, 5 have unit/component tests. ✓

Phase boundary checklist (§12):

- ✓ Plan-detail page at `/plans/[id]`
- ✓ Shared `WorkoutDetailSheet` built (Task 5)
- ✓ Plan-level actions on detail page (Task 7)
- ✓ Mileage chart + stats card (Tasks 8, 10)
- ✓ Rename `/calendar` → `/training` (Task 3)
- ✓ Coach plan-route awareness (Task 4)
- ❌ Sheet wiring into Training/Today — deferred (per spec)

Type consistency:

- `WorkoutRow`: imported from `@/plans/dateQueries` everywhere. ✓
- `PlanStats` shape: defined in Task 2, consumed in Task 8. ✓
- Sheet props (`workout`, `planId`, `units`, `onClose`): defined in Task 5, used in Task 9. ✓
- `WeekGrid` props: defined in Task 9, used in Task 9 itself only. ✓

No placeholders found. All steps include concrete code or commands.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-26-phase-6-plan-detail.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review (spec → quality). Subagents are told NOT to commit; you commit between batches.
2. **Inline Execution** — `superpowers:executing-plans` in this session.

Which approach?
