# Streaming RSC with Suspense

**Date:** 2026-04-27
**Status:** Approved

## Problem

All pages currently await every DB query before rendering anything. During client-side navigation Next.js shows a `loading.tsx` fallback ("Loading…" text) for the full duration of those queries. The result is a jarring blank/text flash between every page transition.

## Goal

Page shells (headers, nav context) paint immediately on navigation. Slow data sections stream in behind skeleton placeholders. No visible loading state between pages.

---

## Architecture

Each page function does only the fast, always-needed work (`auth()` + user preferences + one optional anchor query), then renders the shell synchronously. Slow data sections become **async Server Components** wrapped in `<Suspense>`.

```
Page (async) — auth() + prefs + optional anchor query
├── <header /> ← paints immediately
├── <Suspense fallback={<SectionASkeleton />}>
│     <SectionA userId={...} />   ← does its own fetch
├── <Suspense fallback={<SectionBSkeleton />}>
│     <SectionB userId={...} />
```

All Suspense boundaries within a page resolve independently and in parallel — no waterfall.

`loading.tsx` is **deleted**. Without it, Next.js holds the previous page visible during client-side navigation until the shell is ready (~50ms for `auth()`). For a logged-in app where hard navigation is rare, this is the better tradeoff.

---

## Skeleton System

**Primitive:** `src/components/skeletons/Skeleton.tsx` — a gray rounded block with a CSS pulse animation (`opacity: 1 → 0.4 → 1`, 1.4s ease-in-out infinite). Sized via `width`/`height`/`className` props. Uses `--color-bg-secondary` fill.

**Composition:** Page-specific skeletons are composed from the primitive and co-located with their section component (e.g. `HeroWorkoutSkeleton` lives next to `HeroSection.tsx`).

No third-party skeleton library.

---

## Per-Page Changes

### Today (`/today`)

**Stays in page function:** `auth()`, units preference, `getActivePlan()` (needed for header title + CoachLink planId).

**Suspense sections:**

- `<HeroSection userId planId units />` — `getWorkoutsForDateRange(today, today)` — fallback: `HeroWorkoutSkeleton` (~140px tall card)
- `<ActivitiesSection userId units />` — `getActivitiesForDateRange(today, today)` — fallback: `ActivitiesSkeleton` (heading + 2 row stubs)
- `<UpNextSection userId units />` — `getNextWorkouts(userId, today, 2)` — fallback: `UpNextSkeleton` (2 compact row stubs)

### Training / Calendar (`/training`)

**Stays in page function:** `auth()`, units, `getActivePlan()` (plan title in header), week calculation from searchParams.

**Suspense sections:**

- `<WeekAgendaSection userId monday sunday units activePlanId />` — `getWorkoutsForDateRange` + `getActivitiesForDateRange` in parallel — fallback: `WeekAgendaSkeleton` (7 day-row stubs)

The interactive layer (workout detail sheet) remains a Client Component; `WeekAgendaSection` renders it with data props.

### Plans (`/plans`)

**Stays in page function:** `auth()`.

**Suspense sections:**

- `<PlansListSection userId today />` — `listPlansWithCounts` + `listInFlightPlanFiles` in parallel — fallback: `PlansListSkeleton` (3 card stubs)

### Plan Detail (`/plans/[id]`)

**Stays in page function:** `auth()`, `getPlanById()` (plan title/dates needed for shell header), week calculation.

**Suspense sections:**

- `<PlanWeekSection userId planId monday sunday units />` — `getWorkoutsForPlan` + `getActivitiesForDateRange` in parallel — fallback: `PlanWeekSkeleton` (reuses WeekAgendaSkeleton)

### Coach (`/coach`)

**Stays in page function:** `auth()`, plan lookup from searchParams (needed for context pill in header).

**Suspense sections:**

- `<MessagesSection userId planId />` — `loadHistory(userId, planId)` — fallback: `MessagesSkeleton` (3-4 bubble stubs alternating sides)

### Settings (`/settings`)

**Stays in page function:** `auth()`. `SettingsForm` renders immediately from `session.user.preferences` — no extra query.

**Suspense sections:**

- `<CoachNotesSection userId />` — single `coach_notes` DB query — fallback: `CoachNotesSkeleton` (textarea-shaped block)

---

## Error Handling

Each async Server Component throws on DB failure, bubbling to the nearest `error.tsx` boundary. No per-section error UI is needed — a page-level error boundary is sufficient for this app's scale.

---

## Testing

- Existing unit tests for query functions are unaffected.
- No new tests needed for the async Server Components themselves — they are thin wrappers around already-tested query functions.
- Manual verification: navigate between all pages and confirm shell paints before data arrives.
