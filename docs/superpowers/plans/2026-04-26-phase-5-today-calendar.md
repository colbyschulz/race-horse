# Phase 5: Today + Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Branch policy:** This phase is implemented directly on `master` (per user instruction — no feature branch).
>
> **Commit policy override:** the user drives all commits. Implementer subagents should NOT run `git commit`. Leave changes staged or unstaged at the end of each task and report what's ready.

**Goal:** Ship the Today and Calendar pages. Today renders the date's planned workout (hero), all Strava activities for the date (each linking out to Strava), and a 2-day "Up next" preview. Calendar renders a single week as agenda rows (date + workout badge + distance/duration/pace) with prev/next-week buttons.

**Architecture:**
- Pure server-component pages for data fetching, with a thin client component on Calendar for prev/next-week state. No new schema, no new tables — the underlying data is already in `plans`, `workouts`, `activities`.
- Two new query helpers: one for date-windowed plan workouts, one for date-windowed activities. Both take `userId` for safety.
- Shared presentational components: `WorkoutBadge` (badge with type + color) and `ActivityRow` (Strava activity link + stats).
- Empty state handled at page level: if no active plan → "no plan" callout with link to `/plans`.

**Tech Stack:**
- Next.js 16 App Router (server components + client component for prev/next nav)
- Drizzle ORM + Neon Postgres (HTTP driver, no transactions)
- SCSS Modules using existing `--color-*`, `--space-*`, `--font-*` tokens from `src/styles/tokens.scss`
- Vitest + mocked DB for query/component tests

---

## Design source

- **Today**: `docs/design/project/Race Horse Hi-Fi.html` `TodayB` (lines ~332–401) and `TodayDesktop` (~404–502). Editorial big-type headline, stat row, intensity panel, Strava section, "Up next" 2-day list.
- **Calendar**: same file `CalendarWeekB` (~568–657). Agenda rows, prev/next week buttons, **no checkmarks**, week total at bottom.
- **Per user**: replace the design's single "Strava matched" pill on Today with a list of *all* activities for the date; each entry is a link to the Strava activity (`https://www.strava.com/activities/{strava_id}`).

---

## File structure

**Create:**
- `src/components/workouts/WorkoutBadge.tsx` + `.module.scss` — workout type badge (one of 9 types), used in Today + Calendar + Plans (later).
- `src/components/workouts/__tests__/WorkoutBadge.test.tsx` — verifies each enum value renders with correct label.
- `src/components/activities/ActivityRow.tsx` + `.module.scss` — Strava activity row with deep-link to `https://www.strava.com/activities/{strava_id}`. Shows distance, time, pace/power, HR.
- `src/components/activities/__tests__/ActivityRow.test.tsx`
- `src/plans/dateQueries.ts` — date-windowed plan queries.
  - `getActivePlanForUser(userId)` — single row from `plans` (already exists in `queries.ts` semantics; reuse if present).
  - `getWorkoutsForDateRange(userId, startDate, endDate)` — joined to active plan.
  - `getNextWorkouts(userId, today, n)` — next `n` workouts strictly *after* today.
- `src/plans/__tests__/dateQueries.test.ts` — mocked-DB unit tests.
- `src/strava/dateQueries.ts`
  - `getActivitiesForDateRange(userId, startDate, endDate)` — full activity rows.
- `src/strava/__tests__/dateQueries.test.ts`
- `src/lib/dates.ts` — pure helpers: `todayIso(units?)`, `mondayOf(date)`, `addDays(date, n)`, `formatWeekLabel(monday)` (e.g. `"Apr 21–27"`), `formatDayLabel(date)` (e.g. `"Mon 21"`), `formatLongDate(date)` (e.g. `"Friday, April 25"`), `parseIso(date)`.
- `src/lib/__tests__/dates.test.ts`
- `src/app/(app)/today/page.tsx` (server)
- `src/app/(app)/today/Today.module.scss`
- `src/app/(app)/today/HeroWorkout.tsx` (server-rendered, no client behavior)
- `src/app/(app)/today/UpNext.tsx`
- `src/app/(app)/today/NoActivePlan.tsx` (empty state shared with Calendar)
- `src/app/(app)/calendar/page.tsx` (server)
- `src/app/(app)/calendar/CalendarClient.tsx` (client — owns the `weekOffset` state + prev/next buttons + URL sync)
- `src/app/(app)/calendar/Calendar.module.scss`
- `src/app/(app)/calendar/WeekAgenda.tsx` (server-friendly presentational; takes `days` array)

**Modify:**
- `src/app/(app)/today/page.tsx` if it exists — currently a placeholder; rewrite per this plan.
- `src/app/(app)/calendar/page.tsx` if it exists — same.

**Note on existing placeholders:** `git ls-files src/app/\(app\)/today src/app/\(app\)/calendar` will show what's there. Both were left as empty placeholder pages by Phase 1. Replace, don't merge.

---

## Workout type styling

Each `workoutTypeEnum` value gets a label + color for the badge. Match the hi-fi color scheme (`docs/design/project/Race Horse Hi-Fi.html` defines `T.brown`, `T.olive`, `T.terra`, `T.bgSubtle`, etc.; the tokens file is `src/styles/tokens.scss`).

| Enum | Label | Token (subject to designer review — pick the closest existing) |
|------|-------|----------------------------------------------------------------|
| `easy` | Easy | `--color-olive-100` bg, `--color-olive` text |
| `long` | Long | `--color-brown-subtle` bg, `--color-brown` text |
| `tempo` | Tempo | `--color-terra-100` bg, `--color-terra` text |
| `threshold` | Threshold | `--color-terra-100` bg, `--color-terra` text |
| `intervals` | Intervals | `--color-terra-100` bg, `--color-terra` text |
| `recovery` | Recovery | `--color-olive-100` bg, `--color-olive` text |
| `race` | Race | `--color-brown` bg, `#fff` text |
| `rest` | Rest | `--color-bg-subtle` bg, `--color-fg-tertiary` text |
| `cross` | Cross | `--color-bg-subtle` bg, `--color-fg-secondary` text |

> **Implementer note:** if any of the named tokens above is missing from `tokens.scss`, fall back to inline-defined rgba values (don't crash the build). Open `tokens.scss` first — the actual palette uses `--color-brown`, `--color-olive`, `--color-terra`, `--color-bg-base`, `--color-bg-surface`, `--color-bg-subtle`, `--color-fg-primary`, `--color-fg-secondary`, `--color-fg-tertiary`, `--color-border-default`, `--color-border-subtle`. If `*-100` variants don't exist, use `color-mix(in srgb, var(--color-X) 12%, transparent)` for the soft backgrounds.

---

## Task 1: Date helpers

**Files:**
- Create: `src/lib/dates.ts`
- Create: `src/lib/__tests__/dates.test.ts`

**Step 1: Write failing tests**

```ts
// src/lib/__tests__/dates.test.ts
import { describe, it, expect } from "vitest";
import { mondayOf, addDays, formatWeekLabel, formatDayLabel, formatLongDate, todayIso, parseIso } from "../dates";

describe("mondayOf", () => {
  it("returns the Monday of the same week (Sun → previous Mon)", () => {
    expect(mondayOf("2026-04-26")).toBe("2026-04-20"); // Sun → previous Mon
  });
  it("Mon → same Mon", () => {
    expect(mondayOf("2026-04-20")).toBe("2026-04-20");
  });
  it("Wed → previous Mon", () => {
    expect(mondayOf("2026-04-22")).toBe("2026-04-20");
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
  });
  it("subtracts with negative", () => {
    expect(addDays("2026-05-01", -1)).toBe("2026-04-30");
  });
  it("crosses year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("formatWeekLabel", () => {
  it("labels a same-month week", () => {
    expect(formatWeekLabel("2026-04-20")).toBe("Apr 20–26");
  });
  it("labels a cross-month week", () => {
    expect(formatWeekLabel("2026-04-27")).toBe("Apr 27–May 3");
  });
});

describe("formatDayLabel", () => {
  it("returns 'Mon 21' format", () => {
    expect(formatDayLabel("2026-04-20")).toBe("Mon 20");
  });
});

describe("formatLongDate", () => {
  it("returns 'Friday, April 25'", () => {
    expect(formatLongDate("2026-04-24")).toBe("Friday, April 24");
  });
});

describe("parseIso / round-trip", () => {
  it("parses then re-formats", () => {
    expect(addDays(parseIso("2026-04-26"), 0)).toBe("2026-04-26");
  });
});

describe("todayIso", () => {
  it("returns YYYY-MM-DD", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

**Step 2: Run, expect failure** (`Cannot find module '../dates'`).

```bash
npx vitest run src/lib/__tests__/dates.test.ts
```

**Step 3: Implement `src/lib/dates.ts`**

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns YYYY-MM-DD as a Date in UTC midnight. */
export function parseIso(iso: string): string {
  // pass-through identity (we keep ISO strings as the canonical type)
  return iso;
}

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoFromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Adds (or subtracts) days, returning ISO. */
export function addDays(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoFromUtcDate(d);
}

/** Returns the Monday of the same ISO-week as `iso` (Mon=1, Sun=0 → -6). */
export function mondayOf(iso: string): string {
  const d = toUtcDate(iso);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return isoFromUtcDate(d);
}

const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatWeekLabel(monday: string): string {
  const start = toUtcDate(monday);
  const end = toUtcDate(addDays(monday, 6));
  const startStr = `${SHORT_MONTH[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const endStr =
    start.getUTCMonth() === end.getUTCMonth()
      ? `${end.getUTCDate()}`
      : `${SHORT_MONTH[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${startStr}–${endStr}`;
}

export function formatDayLabel(iso: string): string {
  const d = toUtcDate(iso);
  return `${SHORT_WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export function formatLongDate(iso: string): string {
  const d = toUtcDate(iso);
  return `${LONG_WEEKDAY[d.getUTCDay()]}, ${LONG_MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
```

**Step 4: Run, expect pass.**

**Step 5: Stage** (do not commit).

---

## Task 2: WorkoutBadge component

**Files:**
- Create: `src/components/workouts/WorkoutBadge.tsx`
- Create: `src/components/workouts/WorkoutBadge.module.scss`
- Create: `src/components/workouts/__tests__/WorkoutBadge.test.tsx`

**Step 1: Write failing test**

```tsx
// src/components/workouts/__tests__/WorkoutBadge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkoutBadge } from "../WorkoutBadge";

describe("WorkoutBadge", () => {
  it("renders the label for each type", () => {
    const types = ["easy", "long", "tempo", "threshold", "intervals", "recovery", "race", "rest", "cross"] as const;
    for (const t of types) {
      const { unmount } = render(<WorkoutBadge type={t} />);
      // capitalized label
      const label = t.charAt(0).toUpperCase() + t.slice(1);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
  it("respects size prop", () => {
    const { container } = render(<WorkoutBadge type="easy" size="sm" />);
    expect(container.firstChild).toHaveClass(/sm/);
  });
});
```

**Step 2: Run, expect failure.**

```bash
npx vitest run src/components/workouts/__tests__/WorkoutBadge.test.tsx
```

If `@testing-library/react` is not installed, install it: `npm install -D @testing-library/react @testing-library/jest-dom`. Add `import "@testing-library/jest-dom"` to `vitest.setup.ts` (create if missing) and reference it in `vitest.config.ts`.

**Step 3: Implement**

```tsx
// src/components/workouts/WorkoutBadge.tsx
import styles from "./WorkoutBadge.module.scss";

export type WorkoutType =
  | "easy" | "long" | "tempo" | "threshold" | "intervals"
  | "recovery" | "race" | "rest" | "cross";

const LABELS: Record<WorkoutType, string> = {
  easy: "Easy",
  long: "Long",
  tempo: "Tempo",
  threshold: "Threshold",
  intervals: "Intervals",
  recovery: "Recovery",
  race: "Race",
  rest: "Rest",
  cross: "Cross",
};

interface Props {
  type: WorkoutType;
  size?: "sm" | "md";
}

export function WorkoutBadge({ type, size = "md" }: Props) {
  return (
    <span className={`${styles.badge} ${styles[type]} ${styles[size]}`}>
      {LABELS[type]}
    </span>
  );
}
```

```scss
// src/components/workouts/WorkoutBadge.module.scss
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
  border: 1px solid transparent;
}
.md { padding: 4px 10px; font-size: 0.75rem; }
.sm { padding: 2px 8px; font-size: 0.6875rem; }

.easy, .recovery {
  background: color-mix(in srgb, var(--color-olive) 14%, transparent);
  color: var(--color-olive);
}
.long {
  background: var(--color-brown-subtle, color-mix(in srgb, var(--color-brown) 12%, transparent));
  color: var(--color-brown);
}
.tempo, .threshold, .intervals {
  background: color-mix(in srgb, var(--color-terra, #C4622D) 14%, transparent);
  color: var(--color-terra, #C4622D);
}
.race {
  background: var(--color-brown);
  color: #fff;
}
.rest {
  background: var(--color-bg-subtle);
  color: var(--color-fg-tertiary);
}
.cross {
  background: var(--color-bg-subtle);
  color: var(--color-fg-secondary);
}
```

**Step 4: Run, expect pass. Stage.**

---

## Task 3: Plan date queries

**Files:**
- Create: `src/plans/dateQueries.ts`
- Create: `src/plans/__tests__/dateQueries.test.ts`

Read `src/plans/queries.ts` first to see what's already there — `getActivePlanForUser` may already exist; if so, import it instead of redefining.

**Functions:**

```ts
// src/plans/dateQueries.ts
import { db } from "@/db";
import { plans, workouts } from "@/db/schema";
import { and, asc, eq, gt, gte, lte } from "drizzle-orm";

export type WorkoutRow = typeof workouts.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;

export async function getActivePlan(userId: string): Promise<PlanRow | null> {
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.is_active, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getWorkoutsForDateRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<WorkoutRow[]> {
  const active = await getActivePlan(userId);
  if (!active) return [];
  return db
    .select()
    .from(workouts)
    .where(
      and(
        eq(workouts.plan_id, active.id),
        gte(workouts.date, startDate),
        lte(workouts.date, endDate),
      ),
    )
    .orderBy(asc(workouts.date));
}

export async function getNextWorkouts(
  userId: string,
  today: string,
  n: number,
): Promise<WorkoutRow[]> {
  const active = await getActivePlan(userId);
  if (!active) return [];
  return db
    .select()
    .from(workouts)
    .where(and(eq(workouts.plan_id, active.id), gt(workouts.date, today)))
    .orderBy(asc(workouts.date))
    .limit(n);
}
```

**Tests** (use the same chained-mock style as `src/strava/__tests__/queries.test.ts`):

- `getActivePlan` returns null when no row.
- `getWorkoutsForDateRange` returns empty when no active plan; returns rows for valid range.
- `getNextWorkouts` honors `limit(n)` and filters strictly `> today`.

**Step 1:** Write the test. **Step 2:** Run, expect failure. **Step 3:** Implement. **Step 4:** Run, expect pass. **Step 5:** Stage.

---

## Task 4: Strava activity date queries

**Files:**
- Create: `src/strava/dateQueries.ts`
- Create: `src/strava/__tests__/dateQueries.test.ts`

```ts
// src/strava/dateQueries.ts
import { db } from "@/db";
import { activities } from "@/db/schema";
import { and, asc, between, eq, gte, lte, sql } from "drizzle-orm";

export type ActivityRow = typeof activities.$inferSelect;

/** Returns activities whose start_date (in user's local time) falls within the inclusive ISO date range. */
export async function getActivitiesForDateRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<ActivityRow[]> {
  return db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.user_id, userId),
        // activities.start_date is a timestamptz; cast to date for comparison.
        gte(sql`${activities.start_date}::date`, startDate),
        lte(sql`${activities.start_date}::date`, endDate),
      ),
    )
    .orderBy(asc(activities.start_date));
}
```

> **Implementer note:** Read `src/db/schema.ts` to confirm the column name for the activity start time (`start_date` vs `start_date_local` — Phase 2 stored the local-time copy as `start_date_local` if at all). Use whichever the schema declares. If only `start_date` (UTC tz) exists and the user has activities crossing midnight in their tz, the comparison may be slightly off — for v1 this is acceptable (we'll revisit if it causes user-visible bugs).

**Tests:** mock `db`, assert the where-clause arguments and the returned rows pass through. Use the same style as `src/strava/__tests__/queries.test.ts`.

**Step 1–5:** TDD as above.

---

## Task 5: ActivityRow component

**Files:**
- Create: `src/components/activities/ActivityRow.tsx`
- Create: `src/components/activities/ActivityRow.module.scss`
- Create: `src/components/activities/__tests__/ActivityRow.test.tsx`

**Behavior:**
- Renders a single Strava activity as a clickable row that opens `https://www.strava.com/activities/{strava_id}` in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). Strava's mobile app intercepts this URL on iOS/Android, so a single href works for both.
- Shows: activity name (`activities.name`), distance (formatted to mi/km per user units), moving time (h:mm:ss or m:ss), avg pace OR avg power (depending on sport), avg HR.
- Uses `WorkoutBadge`'s sport color for the type indicator (green for Run, terra for Bike — `activities.type` is e.g. "Run", "Ride", "VirtualRide", "Workout").

**Props:**
```ts
interface Props {
  activity: ActivityRow;        // from src/strava/dateQueries.ts
  units: "mi" | "km";
}
```

**Step 1: TDD test**
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityRow } from "../ActivityRow";

const activity = {
  id: "a-1",
  user_id: "u-1",
  strava_id: 123456789,
  name: "Morning Run",
  type: "Run",
  start_date: new Date("2026-04-25T13:00:00Z"),
  distance_meters: "12701.6", // numeric → string from drizzle
  moving_time_seconds: 3462,
  avg_hr: 148,
  avg_pace_seconds_per_km: 270,
  avg_power_watts: null,
  elevation_gain_m: 80,
  matched_workout_id: null,
} as never;

describe("ActivityRow", () => {
  it("renders the activity name", () => {
    render(<ActivityRow activity={activity} units="mi" />);
    expect(screen.getByText("Morning Run")).toBeInTheDocument();
  });
  it("links to strava.com/activities/<id> in a new tab", () => {
    render(<ActivityRow activity={activity} units="mi" />);
    const link = screen.getByRole("link", { name: /Morning Run/ });
    expect(link).toHaveAttribute("href", "https://www.strava.com/activities/123456789");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
  it("formats distance in mi when units=mi", () => {
    render(<ActivityRow activity={activity} units="mi" />);
    // 12701.6 m = 7.89 mi — accept either "7.89" or "7.9"
    expect(screen.getByText(/7\.[89]/)).toBeInTheDocument();
  });
  it("formats distance in km when units=km", () => {
    render(<ActivityRow activity={activity} units="km" />);
    expect(screen.getByText(/12\.7/)).toBeInTheDocument();
  });
});
```

**Step 2: Run, expect failure.**

**Step 3: Implement** (sketch — full impl during execution):

```tsx
// src/components/activities/ActivityRow.tsx
import styles from "./ActivityRow.module.scss";
import type { ActivityRow as Activity } from "@/strava/dateQueries";

function fmtDistance(meters: number, units: "mi" | "km"): string {
  if (units === "mi") return (meters / 1609.344).toFixed(2);
  return (meters / 1000).toFixed(2);
}

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtPace(secPerKm: number, units: "mi" | "km"): string {
  const sec = units === "mi" ? Math.round(secPerKm * 1.609344) : Math.round(secPerKm);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ActivityRow({ activity, units }: { activity: Activity; units: "mi" | "km" }) {
  const meters = Number(activity.distance_meters ?? 0);
  const time = activity.moving_time_seconds ?? 0;
  const pace = activity.avg_pace_seconds_per_km ?? null;
  const power = activity.avg_power_watts ?? null;
  const hr = activity.avg_hr ?? null;
  const url = `https://www.strava.com/activities/${activity.strava_id}`;

  return (
    <a className={styles.row} href={url} target="_blank" rel="noopener noreferrer">
      <div className={styles.head}>
        <span className={styles.name}>{activity.name}</span>
        <span className={styles.kind}>{activity.type}</span>
      </div>
      <div className={styles.stats}>
        <span><strong>{fmtDistance(meters, units)}</strong> {units}</span>
        <span><strong>{fmtDuration(time)}</strong></span>
        {pace != null && <span><strong>{fmtPace(pace, units)}</strong> /{units}</span>}
        {power != null && <span><strong>{Math.round(power)}</strong> W</span>}
        {hr != null && <span><strong>{hr}</strong> bpm</span>}
      </div>
    </a>
  );
}
```

```scss
// src/components/activities/ActivityRow.module.scss
.row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--color-fg-primary);
  background: var(--color-bg-surface);
  transition: border-color 120ms ease, background 120ms ease;
  &:hover {
    border-color: var(--color-brown);
    background: color-mix(in srgb, var(--color-brown) 4%, var(--color-bg-surface));
  }
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.name {
  font-weight: 600;
  font-size: 0.9375rem;
}
.kind {
  font-size: 0.75rem;
  color: var(--color-fg-tertiary);
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 0.8125rem;
  color: var(--color-fg-secondary);
  strong { color: var(--color-fg-primary); font-weight: 600; }
}
```

**Step 4: Run, expect pass. Stage.**

---

## Task 6: NoActivePlan empty-state component

**Files:**
- Create: `src/components/plans/NoActivePlan.tsx` + `.module.scss`

A reusable empty-state card with copy and a CTA. Used by both Today and Calendar.

```tsx
"use client";
import Link from "next/link";
import styles from "./NoActivePlan.module.scss";

export function NoActivePlan({ context }: { context: "today" | "calendar" }) {
  const subline =
    context === "today"
      ? "Your training will show up here once you activate a plan."
      : "Your weekly schedule will show up here once you activate a plan.";
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>No active plan</h2>
      <p className={styles.subline}>{subline}</p>
      <Link href="/plans" className={styles.cta}>Go to Plans →</Link>
    </div>
  );
}
```

SCSS: centered card with brown subtle bg, brown CTA button. Match the existing `PlansEmptyState` style.

**Step 1:** Read `src/components/plans/PlansEmptyState.module.scss` and reuse spacing/typography. **Step 2:** Implement. **Step 3:** Stage. (No tests — purely presentational, exercised in page-level tests if at all.)

---

## Task 7: Today page

**Files:**
- Create: `src/app/(app)/today/page.tsx`
- Create: `src/app/(app)/today/Today.module.scss`
- Create: `src/app/(app)/today/HeroWorkout.tsx`
- Create: `src/app/(app)/today/UpNext.tsx`

**Step 1: Read existing placeholder.** `src/app/(app)/today/page.tsx` is currently a stub. Replace it.

**Step 2: Page (server component)**

```tsx
// src/app/(app)/today/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getActivePlan, getWorkoutsForDateRange, getNextWorkouts } from "@/plans/dateQueries";
import { getActivitiesForDateRange } from "@/strava/dateQueries";
import { todayIso, formatLongDate } from "@/lib/dates";
import { HeroWorkout } from "./HeroWorkout";
import { UpNext } from "./UpNext";
import { ActivityRow } from "@/components/activities/ActivityRow";
import { NoActivePlan } from "@/components/plans/NoActivePlan";
import styles from "./Today.module.scss";

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const today = todayIso();

  const [pref] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  const units = ((pref?.preferences as { units?: string } | null)?.units === "km" ? "km" : "mi") as "mi" | "km";

  const activePlan = await getActivePlan(userId);
  const todaysWorkouts = activePlan
    ? await getWorkoutsForDateRange(userId, today, today)
    : [];
  const upNext = activePlan ? await getNextWorkouts(userId, today, 2) : [];
  const todaysActivities = await getActivitiesForDateRange(userId, today, today);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.date}>{formatLongDate(today)}</h1>
        {activePlan && (
          <p className={styles.subline}>
            {activePlan.title}
          </p>
        )}
      </header>

      {!activePlan && <NoActivePlan context="today" />}

      {activePlan && (todaysWorkouts.length > 0
        ? <HeroWorkout workout={todaysWorkouts[0]} units={units} />
        : <div className={styles.restCard}>Rest day. Easy day, smooth day.</div>
      )}

      {todaysActivities.length > 0 && (
        <section className={styles.activities}>
          <h2 className={styles.h2}>Today&apos;s activities</h2>
          <div className={styles.activityList}>
            {todaysActivities.map((a) => <ActivityRow key={a.id} activity={a} units={units} />)}
          </div>
        </section>
      )}

      {activePlan && upNext.length > 0 && <UpNext workouts={upNext} />}
    </div>
  );
}
```

**Step 3: HeroWorkout** — renders the editorial big-type card from `TodayB`. Distance/duration/pace stat row with vertical dividers. Intensity panel with Pace/HR/RPE pulled from `workout.target_intensity` (see `src/db/schema.ts` for the JSON shape — likely `{ pace?: { min: string; max: string }; hr?: { zone: string }; rpe?: number; power?: ... }`).

```tsx
// src/app/(app)/today/HeroWorkout.tsx
import { WorkoutBadge } from "@/components/workouts/WorkoutBadge";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./Today.module.scss";

interface TargetIntensity {
  pace?: { min?: string; max?: string };
  hr?: { zone?: string };
  rpe?: number | string;
  power?: { min?: number; max?: number };
}

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

function fmtDist(meters: number | null, units: "mi" | "km"): string {
  if (meters == null) return "—";
  return (Number(meters) / (units === "mi" ? 1609.344 : 1000)).toFixed(1);
}
function fmtDur(s: number | null): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}`;
}

export function HeroWorkout({ workout, units }: { workout: WorkoutRow; units: "mi" | "km" }) {
  const t = (workout.target_intensity ?? {}) as TargetIntensity;
  const dist = fmtDist(workout.distance_meters as unknown as number | null, units);
  const dur = fmtDur(workout.duration_seconds);
  const pace = t.pace ? `${t.pace.min ?? ""}${t.pace.max ? `–${t.pace.max}` : ""}` : null;
  return (
    <article className={styles.hero}>
      <div className={styles.heroHead}>
        <WorkoutBadge type={workout.type} />
      </div>
      <h1 className={styles.headline}>{TYPE_HEADLINE[workout.type] ?? workout.type}</h1>
      <div className={styles.statRow}>
        <div className={styles.stat}><span className={styles.statValue}>{dist}</span><span className={styles.statUnit}>{units}</span></div>
        <div className={styles.statDivider} />
        <div className={styles.stat}><span className={styles.statValue}>{dur}</span><span className={styles.statUnit}>min</span></div>
        {pace && (<>
          <div className={styles.statDivider} />
          <div className={styles.stat}><span className={styles.statValue}>{pace}</span><span className={styles.statUnit}>/{units}</span></div>
        </>)}
      </div>
      {(t.pace || t.hr || t.rpe != null) && (
        <div className={styles.intensityRow}>
          {t.pace && <div className={styles.intensityCell}><span className={styles.lbl}>Pace</span><span className={styles.val}>{`${t.pace.min ?? ""}${t.pace.max ? `–${t.pace.max}` : ""}`}</span></div>}
          {t.hr?.zone && <div className={styles.intensityCell}><span className={styles.lbl}>HR</span><span className={styles.val}>{t.hr.zone}</span></div>}
          {t.rpe != null && <div className={styles.intensityCell}><span className={styles.lbl}>RPE</span><span className={styles.val}>{t.rpe}/10</span></div>}
        </div>
      )}
      {workout.notes && <p className={styles.description}>{workout.notes}</p>}
    </article>
  );
}
```

**Step 4: UpNext** — compact 2-day list:

```tsx
// src/app/(app)/today/UpNext.tsx
import { WorkoutBadge } from "@/components/workouts/WorkoutBadge";
import { formatDayLabel } from "@/lib/dates";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./Today.module.scss";

export function UpNext({ workouts }: { workouts: WorkoutRow[] }) {
  return (
    <section className={styles.upNext}>
      <h2 className={styles.h2}>Up next</h2>
      <ul className={styles.upNextList}>
        {workouts.map((w) => (
          <li key={w.id} className={styles.upNextRow}>
            <span className={styles.upNextDay}>{formatDayLabel(w.date)}</span>
            <WorkoutBadge type={w.type} size="sm" />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

**Step 5: Today.module.scss** — model after `TodayB` from the hi-fi. Editorial display headline (use `--font-display`, ~3rem on desktop, ~2.25rem mobile, `letter-spacing: -0.04em`, `line-height: 0.92`). Stat row with vertical dividers (`1px var(--color-border-default)`, height ~36px). Intensity row as 3 equal-flex pills, `var(--color-bg-subtle)` bg, `var(--radius-md)`. Activities and Up next sections with `var(--space-4)` between sibling sections.

**Step 6: Run `npm test -- --run`** — confirm no regressions. **Stage.**

---

## Task 8: Calendar page + week navigation

**Files:**
- Create: `src/app/(app)/calendar/page.tsx`
- Create: `src/app/(app)/calendar/CalendarClient.tsx`
- Create: `src/app/(app)/calendar/Calendar.module.scss`
- Create: `src/app/(app)/calendar/WeekAgenda.tsx`

**State strategy:** the visible week is reflected in the URL via `?week=YYYY-MM-DD` (Monday of the visible week). The page is a server component that reads `searchParams`, defaults to `mondayOf(today)` if absent. Prev/next buttons in `CalendarClient` are simple `<Link>`s with the next monday's `?week=` query — that way the page hits SSR each navigation and there's no client-side fetch.

**Page:**

```tsx
// src/app/(app)/calendar/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getActivePlan, getWorkoutsForDateRange } from "@/plans/dateQueries";
import { addDays, formatWeekLabel, mondayOf, todayIso } from "@/lib/dates";
import { WeekAgenda } from "./WeekAgenda";
import { CalendarClient } from "./CalendarClient";
import { NoActivePlan } from "@/components/plans/NoActivePlan";
import styles from "./Calendar.module.scss";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const today = todayIso();
  const { week } = await searchParams;
  const monday = (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) ? mondayOf(week) : mondayOf(today);
  const sunday = addDays(monday, 6);

  const activePlan = await getActivePlan(userId);
  const workouts = activePlan ? await getWorkoutsForDateRange(userId, monday, sunday) : [];

  return (
    <div className={styles.page}>
      <CalendarClient
        weekLabel={formatWeekLabel(monday)}
        prevHref={`/calendar?week=${addDays(monday, -7)}`}
        nextHref={`/calendar?week=${addDays(monday, 7)}`}
        canGoPrev
        canGoNext
      />
      {!activePlan && <NoActivePlan context="calendar" />}
      {activePlan && <WeekAgenda monday={monday} workouts={workouts} today={today} />}
    </div>
  );
}
```

**CalendarClient (client component):**

```tsx
// src/app/(app)/calendar/CalendarClient.tsx
"use client";
import Link from "next/link";
import styles from "./Calendar.module.scss";

interface Props {
  weekLabel: string;
  prevHref: string;
  nextHref: string;
  canGoPrev: boolean;
  canGoNext: boolean;
}

export function CalendarClient({ weekLabel, prevHref, nextHref, canGoPrev, canGoNext }: Props) {
  return (
    <header className={styles.header}>
      <h1 className={styles.weekLabel}>{weekLabel}</h1>
      <div className={styles.nav}>
        {canGoPrev
          ? <Link className={styles.navBtn} href={prevHref} aria-label="Previous week">← Prev week</Link>
          : <span className={`${styles.navBtn} ${styles.navBtnDisabled}`}>← Prev week</span>}
        {canGoNext
          ? <Link className={styles.navBtn} href={nextHref} aria-label="Next week">Next week →</Link>
          : <span className={`${styles.navBtn} ${styles.navBtnDisabled}`}>Next week →</span>}
      </div>
    </header>
  );
}
```

> The plan currently always sets `canGoPrev = canGoNext = true` (the hero spec doesn't define plan-bounded prev/next; users can browse arbitrarily into the past or future even if no workouts are present — the agenda just renders empty days from a 7-day stride). If you want to bound by plan dates later, that's a Phase 7 polish item.

**WeekAgenda:** for each day in [monday..sunday], find the workout (if any) and render an agenda row matching `CalendarWeekB`:

```tsx
// src/app/(app)/calendar/WeekAgenda.tsx
import { WorkoutBadge } from "@/components/workouts/WorkoutBadge";
import { addDays, formatDayLabel } from "@/lib/dates";
import type { WorkoutRow } from "@/plans/dateQueries";
import styles from "./Calendar.module.scss";

interface Props {
  monday: string;
  today: string;
  workouts: WorkoutRow[];
}

function fmtDist(m: number | null): string {
  if (m == null) return "—";
  return (Number(m) / 1609.344).toFixed(1);
}
function fmtDur(s: number | null): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

export function WeekAgenda({ monday, today, workouts }: Props) {
  const byDate = new Map(workouts.map((w) => [w.date, w]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const totalMeters = workouts.reduce((s, w) => s + Number(w.distance_meters ?? 0), 0);
  const totalSeconds = workouts.reduce((s, w) => s + (w.duration_seconds ?? 0), 0);

  return (
    <div className={styles.agenda}>
      {days.map((d) => {
        const w = byDate.get(d);
        const isToday = d === today;
        const isRest = !w || w.type === "rest";
        return (
          <div key={d} className={`${styles.dayRow} ${isToday ? styles.dayToday : ""}`}>
            <div className={styles.dayHead}>
              <span className={styles.dayLabel}>{formatDayLabel(d)}</span>
              {isRest ? <span className={styles.restLabel}>Rest day</span> : <WorkoutBadge type={w!.type} size="sm" />}
              {isToday && <span className={styles.todayPill}>Today</span>}
            </div>
            {!isRest && w && (
              <div className={styles.dayStats}>
                <span><strong>{fmtDist(w.distance_meters as unknown as number | null)}</strong> mi</span>
                <span><strong>{fmtDur(w.duration_seconds)}</strong></span>
              </div>
            )}
          </div>
        );
      })}
      {workouts.length > 0 && (
        <div className={styles.weekTotal}>
          <span className={styles.totalLabel}>Week total</span>
          <span className={styles.totalValue}>{(totalMeters / 1609.344).toFixed(1)} mi · {fmtDur(totalSeconds)}</span>
        </div>
      )}
    </div>
  );
}
```

> The unit handling for Calendar week agenda uses `mi` hardcoded above for brevity. **Implementer:** read units from `users.preferences.units` in the page, pass them down as a prop, and use them everywhere (matching the Today page).

**Calendar.module.scss:** match the agenda-row style of `CalendarWeekB`. Each row: `padding: 13px 20px`, `border-bottom: 1px solid var(--color-border-subtle)`. Today row: `background: var(--color-brown-subtle)`. Day label: 60px-wide column. Stats: indented 60px from left, baseline-aligned numbers + small unit text.

**Step 1:** Read existing placeholder. **Step 2–6:** Implement files. **Step 7:** Run `npm test -- --run` and `npx tsc --noEmit`. **Stage.**

---

## Task 9: Smoke test

**Files:** none (operational)

- [ ] **Step 1:** `npm run dev`
- [ ] **Step 2:** Visit `/today`. Confirm:
  - Date header reads correctly.
  - If you have an active plan with a workout today: hero card with type, headline, distance/duration/pace, intensity panel, description. If you have a rest day or no workout for today: gentle "Rest day" card.
  - If you have a Strava activity today: "Today's activities" section, each row clicking through to `https://www.strava.com/activities/<id>` (opens Strava app on mobile, web on desktop).
  - "Up next" shows the next 2 workouts (any future date in the plan, regardless of week boundary).
- [ ] **Step 3:** Visit `/calendar`. Confirm:
  - Week label reads e.g. `"Apr 20–26"`.
  - Prev/Next week buttons navigate (URL updates with `?week=YYYY-MM-DD`).
  - Agenda rows show each day with badge + distance/duration. Today row highlighted.
  - Week total at the bottom.
- [ ] **Step 4:** **Empty state**: deactivate the active plan via `/plans` (or set `is_active=false` in DB). Refresh `/today` and `/calendar`. Confirm "No active plan" callout with link to `/plans`.
- [ ] **Step 5:** With no active plan, confirm Today still shows the activities list if any Strava activities exist for today (this is intentional — you can still see your runs even without a plan).

---

## Self-review

Before declaring Phase 5 done, verify:

1. **Spec coverage**:
   - § Today (TodayB editorial): hero with type headline, stat row, intensity panel, description ✓
   - Activities for the day, each linking to Strava (`https://www.strava.com/activities/<id>`) ✓
   - "Up next" 2-day preview ✓
   - § Calendar (CalendarWeekB agenda + prev/next buttons, no checkmarks) ✓
   - § Empty state for no active plan with link to `/plans` ✓

2. **Phase boundary**: did NOT build calendar drill-in (clicking a day → day detail), did NOT add automatic workout matching (kept to per-date listing only), did NOT ship the upload pipeline (Phase 6).

3. **Driver compat**: no `db.transaction()` calls. All queries are single statements.

4. **Auth**: every page checks `auth()` and redirects to `/` on missing session.

5. **No "Co-Authored-By" trailers in commits** (the user commits themselves).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-26-phase-5-today-calendar.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review (spec compliance → code quality). Subagents told NOT to commit; you commit between batches.
2. **Inline Execution** — `superpowers:executing-plans` in this session.

Which approach?
