# Phase 6: Plan Detail View — Design Spec

**Date:** 2026-04-26
**Status:** Approved (design phase)
**Depends on:** Phases 1–5 (skeleton, Strava sync, plans manage, coach, today + calendar)

---

## 1. Goal

Give the user a way to explore a *whole* training plan — past, present, or future — at a higher level than the week-by-week Training view. Today there is no surface for inspecting an archived plan or scanning the structure of an upcoming plan; the Training tab and Today page are scoped to the active plan and the current moment.

The plan-detail page lives at `/plans/[id]` and is reachable by clicking any plan card on the `/plans` list. It works for any plan: active, archived, or freshly-uploaded (this is the page the Phase 7 upload review flow lands on after extraction).

## 2. Non-goals

- **Not a "where am I" view.** That's Today + Training.
- **No phase labels or block metadata.** Block structure is communicated visually via mileage gradient, not stored in the schema. (See §6.)
- **No plan editing UI.** All plan and workout edits go through the coach. The detail page only has plan-level actions (Set active / Archive / Delete).
- **No multi-zoom levels.** The view is a single zoom: full plan, stacked weeks. No 4-week or block-level zoom.
- **No drill-in wiring for Training and Today's Up Next yet.** The shared `WorkoutDetailSheet` component is built in this phase, but only used on plan detail. Wiring it into Training and Today's Up Next is a follow-up task (Phase 6.5 polish or rolled into Phase 8).

## 3. Architecture

- **New page:** `/plans/[id]/page.tsx` — server component, fetches plan + workouts + units in parallel, hands data to a thin client wrapper.
- **New client wrapper:** `PlanDetailClient.tsx` — owns the sheet open/closed state. Server component handles all data; client wrapper handles only interactive state.
- **New components:**
  - `PlanHeader` (server) — title, dates, status badge, action buttons.
  - `PlanStats` (server) — 4-number stats card.
  - `MileageChart` (client) — bar chart, clickable bars scroll to the corresponding week.
  - `WeekGrid` (server) — 7-cell day grid for one week, reuses the `CalendarWeekA` hi-fi pattern. Cells receive an `onClick` handler from the client wrapper.
  - `WorkoutDetailSheet` (client) — bottom-sheet bottom-pinned modal showing full workout details. Built in this phase. Reused later from Training and Up Next.
- **Plan-list cleanup:** The `/plans` list page already has plan cards. In this phase those cards become full-card links to `/plans/[id]`. Plan-level actions (Set active / Archive / Delete) move from the list rows into the detail-page header.
- **Reuses:** `getPlanById`, existing workout queries (extended with a `getWorkoutsForPlan(planId)` if not present), `WorkoutBadge`, `HeroWorkout`-style stat row, intensity panels.
- **No schema changes.** No new columns, tables, or indexes.

## 4. Page structure

Top to bottom:

### 4.1 Plan header
- Plan title (display font, large)
- Subline: sport · date range · mode ("goal" with end_date or "indefinite")
- Status badge: `Active` (brown), `Archived` (muted), or `Upcoming` (terra). Computed: `is_active=true` → Active; else if `start_date > today` → Upcoming; else → Archived.
- Action row:
  - If not active: **Set active** (primary brown button)
  - If active: **Archive** (secondary outline)
  - **Delete** (tertiary, opens confirm dialog) — always shown
- Existing AskCoachButton FAB handles plan-level coach questions; the per-turn context module recognizes `/plans/[id]` paths and pre-loads the plan via `get_plan`.

### 4.2 Plan stats card
A single card with 4 numbers, separated by vertical dividers (same `HeroWorkout` stat-row pattern):

| Stat | Format |
|---|---|
| Total | `"183 mi"` |
| Peak week | `"47.3 mi · Apr 21"` (the Monday of the peak week) |
| Longest run | `"20 mi · May 9"` |
| Weeks | `"12"` |

All distances honor the user's units preference (mi/km).

**Excluded:** race-day countdown. The user's plan is meant to be reviewable for archived plans too, so a countdown would make no sense for plans whose end date has passed.

### 4.3 Mileage chart
- Compact horizontal bar chart, one bar per week.
- Bar height = weekly mileage. Bar color tinted by relative mileage: `color-mix(in srgb, var(--color-brown) X%, var(--color-bg-subtle))` where X scales 20–100 from min to max week.
- No axes, no week labels under bars (kept clean as a visual at-a-glance).
- Hover/click a bar → page scrolls smoothly to that week's grid below. (Mobile: tap.)
- Gradient communicates the plan's arc (build → peak → taper) without phase labels — this is the lightweight version of "block structure" we settled on.

### 4.4 Stacked weeks
For each week from `start_date` (Monday-aligned) to `end_date` (or last workout date), render:

- **Week header row** — `"Apr 21 – 27 · 47.3 mi · 6h 20m"`. Smaller display font, muted secondary color.
- **7-cell day grid** — uses the hi-fi `CalendarWeekA` pattern:
  - Each cell: ~80px tall, rounded, border-subtle.
  - Top 3px stripe in the workout type's color (`--color-workout-{type}`).
  - Body: date number (top-left, small), type label (small, type color), distance (display font, small).
  - Rest days: cell exists but no stripe, type label "Rest" muted.
  - Today (active plan only): brown 2px border, brown-subtle background, "now" microcopy bottom-left.
- **Tap any day** → opens `WorkoutDetailSheet`.

Plan with weeks beyond the schema's `end_date` (rare for goal plans, common for indefinite plans): render only weeks containing workouts.

### 4.5 Workout detail sheet (shared)
A bottom sheet that slides up from the bottom of the screen, dimmed overlay behind. Contains the same vocabulary as `HeroWorkout`:

- Header: type badge + headline (e.g. "Tempo Run") + day label (e.g. "Friday, April 25")
- Stat row: distance / duration / pace (or power for bike), with vertical dividers
- Intensity panels: Pace, HR, RPE, Power (whichever are present in `target_intensity`)
- Intervals list (if `intervals` is present): "5 × 1 km @ 4:00–4:10 / 90s rest" rendered per interval spec
- Notes block (if present)
- Footer: "Ask coach about this workout" link → `/coach?from=/plans/[id]/[date]`. The coach's per-turn context recognizes the date in the path and includes that workout's details in the context.

Dismiss: backdrop click, swipe down, ESC, or close button.

## 5. Data flow

```
/plans/[id]/page.tsx (server)
  ├── auth() → redirect("/") if no session
  ├── getPlanById(id, userId) → 404 if missing/not owned
  ├── getWorkoutsForPlan(plan.id) → workouts ordered by date asc
  ├── users.preferences → units
  └── render <PlanDetailClient plan={...} workouts={...} units={...} />

PlanDetailClient (client)
  ├── useState: openDate (string | null)
  ├── <PlanHeader ...action handlers>
  ├── <PlanStats stats={computeStats(workouts, units)} />
  ├── <MileageChart workouts={workouts} units={units} onSelect={scrollToWeek} />
  ├── for each week: <WeekGrid week={...} workouts={...} onDayClick={(date) => setOpenDate(date)} />
  └── <WorkoutDetailSheet
         workout={openDate ? byDate.get(openDate) : null}
         onClose={() => setOpenDate(null)} />
```

`computeStats` is a pure function that takes the workouts array and the units preference and returns `{ totalMiles, peakWeek: { miles, mondayIso }, longestRun: { miles, dateIso }, weeksCount }`. Lives in `src/plans/stats.ts` and is unit-tested.

## 6. Block structure: the design choice

We deliberately do not store explicit phase data (`base / build / peak / taper`) on workouts or plans. Reasoning:

- **No data we have today.** Existing plans are coach-generated or mock; none carry phase info.
- **Auto-detection is unreliable.** Mileage shape doesn't always reveal phase boundaries (a "build" week might be a step-back week; a recovery week mid-build can look like a taper).
- **The mileage chart already shows the arc.** A gradient from light → dark across the bars communicates "low → high → low" visually without needing labels.
- **We can add phases later.** If the coach gains per-phase advice (e.g., different intensity emphasis in build vs. peak), that's the right time to add a `phase` column. Until then, YAGNI.

## 7. Plan-list page changes

The existing `/plans` list page (Phase 3) currently has rows with inline "Set active / Archive / Delete" buttons.

- **Each plan card becomes a link** to `/plans/[id]`. The whole card is clickable, not just a "View" button.
- **Inline actions are removed** from the list. They live exclusively on the detail page now. The list becomes navigational.
- The empty state ("No plans yet, ask the coach…") remains unchanged.

This consolidation prevents two-source-of-truth bugs and matches the pattern most users expect (list → detail → actions).

## 8. Coach plan-context awareness

The existing `AskCoachButton` FAB passes the current pathname as `from`. The coach's per-turn context module already includes the route name. We extend it:

- If `from` matches `/plans/[uuid]`, prepend the route handler with: "User is viewing plan X. The plan and its workouts are loaded — call `get_plan` if you need full details."
- If `from` matches `/plans/[uuid]/[YYYY-MM-DD]`, additionally pre-load that specific workout.

This is a small addition to `src/coach/context.ts` (or wherever per-turn context lives) — no new tools, no schema changes.

## 9. Visual language

Follows `docs/design/project/Race Horse Hi-Fi.html` (CalendarWeekA pattern for the day grid; Plans hi-fi for header card style; HeroWorkout stat-row pattern for the stats card and sheet).

- **Sand neutrals dominate.** Brown is the only saturated UI accent (status badge, bars, today indicator, primary buttons).
- **Workout type colors only on cells and badges** — never structural.
- **Display font (Syne) for numbers and headlines.** Body font (Roboto) for everything else.
- **Tight tracking, near-1.0 line-height** on display headlines.
- **Mileage-chart gradient** uses `color-mix` of brown over bg-subtle so it sits in the existing palette without introducing a new color.

## 10. File structure

**Create:**
- `src/app/(app)/plans/[id]/page.tsx`
- `src/app/(app)/plans/[id]/PlanDetailClient.tsx`
- `src/app/(app)/plans/[id]/PlanHeader.tsx`
- `src/app/(app)/plans/[id]/PlanStats.tsx`
- `src/app/(app)/plans/[id]/MileageChart.tsx`
- `src/app/(app)/plans/[id]/WeekGrid.tsx`
- `src/app/(app)/plans/[id]/PlanDetail.module.scss`
- `src/components/workouts/WorkoutDetailSheet.tsx` + `.module.scss`
- `src/plans/stats.ts` + `__tests__/stats.test.ts`
- `src/plans/getWorkoutsForPlan.ts` (or extend `dateQueries.ts`) + tests

**Modify:**
- `src/app/(app)/plans/PlansPageClient.tsx` (or equivalent) — make plan cards full-card links, remove inline action buttons
- `src/coach/context.ts` (or wherever per-turn context is composed) — add plan-route awareness
- `src/components/layout/NavLinks.tsx` — rename "Calendar" → "Training", update href to `/training`
- `src/app/(app)/calendar/` directory → rename to `src/app/(app)/training/`

## 11. Testing strategy

- **Unit:**
  - `computeStats` — totals, peak week, longest run, edge cases (empty plan, single-week plan, all-rest plan)
  - `getWorkoutsForPlan` — returns rows ordered by date, scoped to plan
- **Component:**
  - `WorkoutDetailSheet` — opens with the right workout, closes on backdrop/ESC, renders intervals/intensity correctly
  - `MileageChart` — bars rendered, gradient applied, click handler fires
  - `WeekGrid` — cells rendered for each day, today indicator on active plan only, rest cells styled correctly
- **Integration:**
  - `/plans/[id]` smoke: page renders for active, archived, and upcoming plans; 404 for unknown id; redirects to `/` if unauthed
  - Plan-list smoke: cards are links, inline actions are gone

## 12. Phase boundary checklist

This phase **does**:
- ✅ Create the plan-detail page at `/plans/[id]`
- ✅ Build the shared `WorkoutDetailSheet` component
- ✅ Move plan-level actions to the detail page
- ✅ Add the mileage chart and stats card
- ✅ Rename `/calendar` → `/training` and update navigation
- ✅ Make the coach plan-route aware

This phase **does not**:
- ❌ Wire `WorkoutDetailSheet` into Training or Today's Up Next (component is built and ready, but page wiring is deferred)
- ❌ Add multi-zoom (4-week / block / full)
- ❌ Add phase metadata to plans or workouts
- ❌ Add the plan upload pipeline (Phase 7)
- ❌ Add day drill-in for Training/Today/active plan (deferred)

## 13. Open questions

None blocking. Worth revisiting after this lands:

- Should the mileage chart support hover tooltips with the exact mileage? (Currently tap → scroll only.)
- Should there be a "duplicate this plan" action for archived plans, to seed a new plan from an old one's structure? Likely Phase 8.
- Does the `WorkoutDetailSheet` `Ask coach` deep-link survive a coach reload, or do we need to encode the workout id rather than the date? Verify during implementation.
