# SSR Initial Data — Server Component Pages with HydrationBoundary

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all six authenticated app pages from CSR-only (skeleton flash + client-side data waterfall) to server-rendered pages that pre-populate TanStack Query's cache via `HydrationBoundary`, eliminating the skeleton flash and the post-hydration fetch round-trip.

**Architecture:** Each `page.tsx` becomes an `async` server component that fetches its data directly via Drizzle server functions. The fetched data is passed to TanStack Query's `HydrationBoundary` (via `dehydrate(queryClient)`), so client components find their data already in cache and never suspend on initial render. Client-side mutations and `invalidateQueries` continue to work via the existing `/api/*` routes — nothing in those routes changes. A React `cache()` wrapper on `auth()` deduplicates the session lookup within a single request render tree.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5, Drizzle ORM, NextAuth v5

**Serialization note:** When calling `queryClient.setQueryData()`, always pass data through `JSON.parse(JSON.stringify(data))` first. This converts all `Date` objects to ISO strings, matching what the existing `/api/*` routes return via `NextResponse.json()`. Without this step, React RSC serialization preserves Date objects, which mismatches client expectations.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/get-session.ts` | **Create** | `cache()`-wrapped `auth()` — deduplicates session DB lookup per request |
| `src/components/layout/app-shell.tsx` | **Modify** | Remove redundant `auth()` call; accept `userName` prop instead |
| `src/app/(app)/layout.tsx` | **Modify** | Use `getSession()`, pass `userName` to `AppShell` |
| `src/lib/query-client.tsx` | **Modify** | Gate `ReactQueryDevtools` behind `NODE_ENV !== "production"` |
| `src/app/(app)/today/page.tsx` | **Rewrite** | Server component — fetch & hydrate today's data |
| `src/app/(app)/today/today-content.tsx` | **Create** | Extracted client component (`TodayContent`) |
| `src/app/(app)/today/loading.tsx` | **Create** | Route loading state |
| `src/app/(app)/training/page.tsx` | **Rewrite** | Server component — reads `searchParams.week`, fetches week data |
| `src/app/(app)/training/training-content.tsx` | **Create** | Extracted client component (`TrainingContent`, `WeekAgenda`) |
| `src/app/(app)/training/loading.tsx` | **Create** | Route loading state |
| `src/app/(app)/plans/page.tsx` | **Rewrite** | Server component — fetches plan list + in-flight files |
| `src/app/(app)/plans/plans-content.tsx` | **Create** | Extracted client component (`PlansList`) |
| `src/app/(app)/plans/loading.tsx` | **Create** | Route loading state |
| `src/app/(app)/plans/[id]/page.tsx` | **Rewrite** | Server component — awaits params, fetches plan + workouts |
| `src/app/(app)/plans/[id]/plan-detail-content.tsx` | **Create** | Extracted client component (`PlanDetailContent`, `PlanWeek`) |
| `src/app/(app)/plans/[id]/loading.tsx` | **Create** | Route loading state |
| `src/app/(app)/settings/page.tsx` | **Rewrite** | Server component — fetches prefs + coach notes |
| `src/app/(app)/settings/loading.tsx` | **Create** | Route loading state |
| `src/app/(app)/coach/page.tsx` | **Rewrite** | Server component — reads `searchParams`, pre-fetches messages |
| `src/app/(app)/coach/coach-content.tsx` | **Create** | Extracted client component (`CoachContent`, `CoachWithPlanLabel`) |
| `src/app/(app)/coach/loading.tsx` | **Create** | Route loading state |

**Files NOT changing:** All `/api/*` route handlers, all client leaf components (`HeroWorkout`, `Activities`, `UpNext`, `SettingsForm`, `CoachPageClient`, etc.), `src/lib/csr-suspense.tsx` (still needed by `preferences-capture.tsx` and `plans/upload/[id]/review/page.tsx`).

---

## Task 1: Create `getSession` helper + fix double `auth()` in AppShell

Calling `auth()` in both `(app)/layout.tsx` and `app-shell.tsx` hits the session DB twice per navigation. Wrapping `auth` with React's `cache()` deduplicates it within a request render tree. Then we remove the second call from AppShell entirely.

**Files:**
- Create: `src/lib/get-session.ts`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create `get-session.ts`**

```ts
// src/lib/get-session.ts
import { cache } from "react";
import { auth } from "@/server/auth";

export const getSession = cache(auth);
```

- [ ] **Step 2: Rewrite `app-shell.tsx` — accept `userName` prop, remove `auth()` call**

```tsx
// src/components/layout/app-shell.tsx
import { NavLinks } from "./nav-links";
import { TabBar } from "./tab-bar";
import { MainContent } from "./main-content";
import styles from "./app-shell.module.scss";

interface AppShellProps {
  userName: string;
  children: React.ReactNode;
}

export function AppShell({ userName, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.brand}>Race Horse</div>
          {userName && <div className={styles.userLabel}>{userName}</div>}
        </div>
        <NavLinks variant="sidebar" />
      </aside>
      <MainContent>{children}</MainContent>
      <TabBar />
    </div>
  );
}
```

- [ ] **Step 3: Update `(app)/layout.tsx` — use `getSession`, pass `userName`**

```tsx
// src/app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { syncActivities } from "@/server/strava/sync";
import { SyncStatusBanner } from "@/components/sync-status-banner/sync-status-banner";
import { AppShell } from "@/components/layout/app-shell";
import { PreferencesCapture } from "@/components/preferences-capture";
import { QueryProvider } from "@/lib/query-client";

const INITIAL_BACKFILL_DAYS = 90;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");

  const userId = session.user.id;
  const [row] = await db
    .select({ last_synced_at: users.last_synced_at })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (row && row.last_synced_at === null) {
    const startedAt = new Date();
    const sinceDate = new Date(Date.now() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
    await db.update(users).set({ last_synced_at: startedAt }).where(eq(users.id, userId));
    after(async () => {
      try {
        await syncActivities({ userId, sinceDate });
        await db.update(users).set({ last_synced_at: new Date() }).where(eq(users.id, userId));
      } catch (err) {
        console.error("initial backfill failed", userId, err);
      }
    });
  }

  return (
    <QueryProvider>
      <PreferencesCapture />
      <SyncStatusBanner initialSynced={!!row?.last_synced_at} />
      <AppShell userName={session.user.name ?? ""}>{children}</AppShell>
    </QueryProvider>
  );
}
```

- [ ] **Step 4: Start dev server and verify the app loads without TS errors**

```bash
cd /Users/colschulz/Projects/personal/race-horse && npm run dev
```

Expected: no TypeScript errors, app loads normally, sidebar still shows username.

---

## Task 2: Gate `ReactQueryDevtools` in production

**Files:**
- Modify: `src/lib/query-client.tsx`

- [ ] **Step 1: Update `query-client.tsx`**

```tsx
// src/lib/query-client.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV !== "production" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Confirm no errors in dev, devtools still visible in dev mode**

---

## Task 3: Convert `today/page.tsx` to server component + HydrationBoundary

`TodayContent` (currently defined inline in `today/page.tsx`) uses hooks, so it must live in a separate `"use client"` file. The page becomes an `async` server component that fetches data and hydrates the cache.

**Files:**
- Create: `src/app/(app)/today/today-content.tsx`
- Rewrite: `src/app/(app)/today/page.tsx`

- [ ] **Step 1: Create `today-content.tsx` — extract the existing client component**

```tsx
// src/app/(app)/today/today-content.tsx
"use client";

import { Suspense } from "react";
import { todayIso, formatLongDate } from "@/lib/dates";
import { HeroWorkout } from "./hero-workout";
import { Activities } from "./activities";
import { UpNext } from "./up-next";
import { HeroSkeleton } from "@/components/skeletons/hero-skeleton";
import { ActivitiesSkeleton } from "@/components/skeletons/activities-skeleton";
import { UpNextSkeleton } from "@/components/skeletons/up-next-skeleton";
import { EmptyState } from "@/components/empty-state/empty-state";
import { CoachLink } from "@/components/layout/coach-link";
import { PageHeader } from "@/components/layout/page-header";
import { usePreferences } from "@/queries/preferences";
import { useActivePlan } from "@/queries/plans";

export function TodayContent() {
  const { data: prefs } = usePreferences();
  const { data: activePlan } = useActivePlan();
  const today = todayIso(prefs.timezone);

  return (
    <>
      <PageHeader
        title={formatLongDate(today)}
        subtitle={activePlan?.title}
        actions={<CoachLink planId={activePlan?.id} />}
      />

      {!activePlan && (
        <EmptyState
          title="No active plan"
          body="Your training will show up here once you activate a plan."
          variant="tinted"
          size="sm"
          action={{ label: "Go to Plans →", href: "/plans" }}
        />
      )}

      {activePlan && (
        <Suspense fallback={<HeroSkeleton />}>
          <HeroWorkout units={prefs.units} today={today} />
        </Suspense>
      )}

      <Suspense fallback={<ActivitiesSkeleton />}>
        <Activities units={prefs.units} today={today} />
      </Suspense>

      {activePlan && (
        <Suspense fallback={<UpNextSkeleton />}>
          <UpNext units={prefs.units} today={today} />
        </Suspense>
      )}
    </>
  );
}
```

- [ ] **Step 2: Rewrite `today/page.tsx` as a server component**

```tsx
// src/app/(app)/today/page.tsx
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getActivePlan, getWorkoutsForDateRange, getNextWorkouts } from "@/server/plans/date-queries";
import { getActivitiesForDateRange } from "@/server/strava/date-queries";
import { todayIso } from "@/lib/dates";
import { TodayContent } from "./today-content";
import styles from "./today.module.scss";

export default async function TodayPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;
  const today = todayIso(prefs.timezone);

  const [activePlan, workoutsToday, activitiesToday, nextWorkouts] = await Promise.all([
    getActivePlan(userId),
    getWorkoutsForDateRange(userId, today, today),
    getActivitiesForDateRange(userId, today, today),
    getNextWorkouts(userId, today, 1),
  ]);

  const queryClient = new QueryClient();
  // JSON round-trip serializes Date objects to ISO strings (matches /api/* JSON responses)
  const s = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["plans", "active"], s(activePlan));
  queryClient.setQueryData(["workouts", { from: today, to: today }], s(workoutsToday));
  queryClient.setQueryData(["activities", { from: today, to: today }], s(activitiesToday));
  queryClient.setQueryData(["workouts", "next", { after: today, limit: 1 }], s(nextWorkouts));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className={styles.page}>
        <TodayContent />
      </div>
    </HydrationBoundary>
  );
}
```

- [ ] **Step 3: Verify Today page — navigate to `/today` in browser**

Expected: page renders with real data immediately (no skeleton flash). Check Network tab — no `/api/preferences`, `/api/plans/active`, `/api/workouts`, `/api/activities` requests on initial load.

---

## Task 4: Add `today/loading.tsx`

**Files:**
- Create: `src/app/(app)/today/loading.tsx`

- [ ] **Step 1: Create loading state**

```tsx
// src/app/(app)/today/loading.tsx
import { HeroSkeleton } from "@/components/skeletons/hero-skeleton";
import styles from "./today.module.scss";

export default function TodayLoading() {
  return (
    <div className={styles.page}>
      <HeroSkeleton />
    </div>
  );
}
```

---

## Task 5: Convert `training/page.tsx` to server component + HydrationBoundary

`TrainingContent` uses `useSearchParams()` (client-only) and hooks, so it moves to its own file. The server page reads `searchParams.week` to pre-fetch the correct week.

**Files:**
- Create: `src/app/(app)/training/training-content.tsx`
- Rewrite: `src/app/(app)/training/page.tsx`

- [ ] **Step 1: Create `training-content.tsx` — extract `TrainingContent` and `WeekAgenda`**

```tsx
// src/app/(app)/training/training-content.tsx
"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  addDays,
  mondayOf,
  todayIso,
  formatDateShort,
  weekIndexFromStart,
  isIsoDate,
} from "@/lib/dates";
import { planNavBounds } from "@/lib/plan-nav";
import { groupActivitiesByDate } from "@/lib/group-activities";
import { useWorkoutSheet } from "@/lib/use-workout-sheet";
import { WeekNavigator } from "@/components/workouts/week-navigator";
import { WeekAgendaRows } from "@/components/workouts/week-agenda-rows";
import { WorkoutDetailSheet } from "@/components/workouts/workout-detail-sheet";
import { CoachLink } from "@/components/layout/coach-link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state/empty-state";
import { WeekAgendaSkeleton } from "@/components/skeletons/week-agenda-skeleton";
import { usePreferences } from "@/queries/preferences";
import { useActivePlan } from "@/queries/plans";
import { useWorkouts } from "@/queries/workouts";
import { useActivities } from "@/queries/activities";
import styles from "./training.module.scss";

export function TrainingContent() {
  const searchParams = useSearchParams();
  const week = searchParams.get("week");

  const { data: prefs } = usePreferences();
  const { data: activePlan } = useActivePlan();

  const today = todayIso(prefs.timezone);
  const monday = isIsoDate(week) ? mondayOf(week) : mondayOf(today);
  const sunday = addDays(monday, 6);

  if (!activePlan) {
    return (
      <EmptyState
        title="No active plan"
        body="Your weekly schedule will show up here once you activate a plan."
        variant="tinted"
        size="sm"
        action={{ label: "Go to Plans →", href: "/plans" }}
      />
    );
  }

  const isCurrentWeek = monday === mondayOf(today);
  const { prevDisabled, insidePlan } = planNavBounds(
    activePlan.start_date,
    activePlan.end_date,
    monday
  );
  const weekTitle = insidePlan
    ? `Week ${weekIndexFromStart(activePlan.start_date, monday)}`
    : formatDateShort(monday);
  const weekRange = `${formatDateShort(monday)} – ${formatDateShort(sunday)}`;

  return (
    <>
      <PageHeader
        title="Training"
        subtitle={activePlan.title}
        actions={<CoachLink planId={activePlan.id} />}
      />
      <WeekNavigator
        weekTitle={weekTitle}
        weekRange={weekRange}
        prev={prevDisabled ? { disabled: true } : { href: `/training?week=${addDays(monday, -7)}` }}
        next={{ href: `/training?week=${addDays(monday, 7)}` }}
        today={{ href: "/training" }}
        showToday={!isCurrentWeek}
      />
      <Suspense fallback={<WeekAgendaSkeleton />}>
        <WeekAgenda
          monday={monday}
          sunday={sunday}
          today={today}
          units={prefs.units}
          planId={activePlan.id}
        />
      </Suspense>
    </>
  );
}

interface WeekAgendaProps {
  monday: string;
  sunday: string;
  today: string;
  units: "mi" | "km";
  planId: string;
}

function WeekAgenda({ monday, sunday, today, units, planId }: WeekAgendaProps) {
  const { data: workouts } = useWorkouts(monday, sunday);
  const { data: activities } = useActivities(monday, sunday);

  const byDate = useMemo(() => new Map(workouts.map((w) => [w.date, w])), [workouts]);
  const activitiesByDate = useMemo(() => groupActivitiesByDate(activities), [activities]);
  const sheet = useWorkoutSheet((date) => byDate.get(date));

  return (
    <>
      <WeekAgendaRows
        monday={monday}
        byDate={byDate}
        activitiesByDate={activitiesByDate}
        today={today}
        units={units}
        isActivePlan={true}
        onDayClick={sheet.open}
      />
      <WorkoutDetailSheet
        workout={sheet.openWorkout}
        planId={planId}
        units={units}
        onClose={sheet.close}
      />
    </>
  );
}
```

- [ ] **Step 2: Rewrite `training/page.tsx` as a server component**

```tsx
// src/app/(app)/training/page.tsx
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getActivePlan, getWorkoutsForDateRange } from "@/server/plans/date-queries";
import { getActivitiesForDateRange } from "@/server/strava/date-queries";
import { addDays, mondayOf, todayIso, isIsoDate } from "@/lib/dates";
import { TrainingContent } from "./training-content";
import styles from "./training.module.scss";

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;

  const params = await searchParams;
  const week = typeof params.week === "string" ? params.week : undefined;
  const today = todayIso(prefs.timezone);
  const monday = isIsoDate(week) ? mondayOf(week) : mondayOf(today);
  const sunday = addDays(monday, 6);

  const [activePlan, workouts, activities] = await Promise.all([
    getActivePlan(userId),
    getWorkoutsForDateRange(userId, monday, sunday),
    getActivitiesForDateRange(userId, monday, sunday),
  ]);

  const queryClient = new QueryClient();
  const s = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["plans", "active"], s(activePlan));
  queryClient.setQueryData(["workouts", { from: monday, to: sunday }], s(workouts));
  queryClient.setQueryData(["activities", { from: monday, to: sunday }], s(activities));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className={styles.page}>
        <TrainingContent />
      </div>
    </HydrationBoundary>
  );
}
```

- [ ] **Step 3: Add `training/loading.tsx`**

```tsx
// src/app/(app)/training/loading.tsx
import { WeekAgendaSkeleton } from "@/components/skeletons/week-agenda-skeleton";
import styles from "./training.module.scss";

export default function TrainingLoading() {
  return (
    <div className={styles.page}>
      <WeekAgendaSkeleton />
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser — navigate to `/training`**

Expected: page renders with real content immediately. Week navigation (changing `?week=` param) still works, loading new weeks fetches from `/api/workouts`.

---

## Task 6: Convert `plans/page.tsx` to server component + HydrationBoundary

**Files:**
- Create: `src/app/(app)/plans/plans-content.tsx`
- Rewrite: `src/app/(app)/plans/page.tsx`

- [ ] **Step 1: Create `plans-content.tsx` — extract `PlansList`**

```tsx
// src/app/(app)/plans/plans-content.tsx
"use client";

import { todayIso } from "@/lib/dates";
import { PlanCard } from "@/components/plans/plan-card";
import { EmptyState } from "@/components/empty-state/empty-state";
import { InFlightUploadCard } from "@/components/plans/in-flight-upload-card";
import { usePreferences } from "@/queries/preferences";
import { usePlans, useInFlightPlanFiles } from "@/queries/plans";
import styles from "./plans.module.scss";

export function PlansList() {
  const { data: prefs } = usePreferences();
  const { data: plans } = usePlans();
  const { data: planFiles } = useInFlightPlanFiles();

  const today = todayIso(prefs.timezone);
  const sorted = [...plans.filter((p) => p.is_active), ...plans.filter((p) => !p.is_active)];

  return (
    <>
      {planFiles.length > 0 && (
        <section className={styles.inflight}>
          {planFiles.map((f) => (
            <InFlightUploadCard key={f.id} row={f} />
          ))}
        </section>
      )}

      {plans.length === 0 && planFiles.length === 0 && (
        <EmptyState
          title="No plans yet"
          body="Once the coach is online or upload is wired up, your plans will live here."
          variant="bordered"
          size="sm"
        />
      )}

      {sorted.length > 0 && (
        <div className={styles.planList}>
          {sorted.map((p) => (
            <PlanCard key={p.id} plan={p} today={today} units={prefs.units} />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Rewrite `plans/page.tsx` as a server component**

```tsx
// src/app/(app)/plans/page.tsx
import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { listPlansWithCounts } from "@/server/plans/queries";
import { listInFlightPlanFiles } from "@/server/plans/files";
import { PageHeader } from "@/components/layout/page-header";
import { UploadDropzone } from "@/components/plans/upload-dropzone";
import { PlansListSkeleton } from "@/components/skeletons/plans-list-skeleton";
import { PlansList } from "./plans-content";
import styles from "./plans.module.scss";

export default async function PlansPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;

  const [plans, planFiles] = await Promise.all([
    listPlansWithCounts(userId),
    listInFlightPlanFiles(userId),
  ]);

  const queryClient = new QueryClient();
  const s = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["plans", "list"], s(plans));
  queryClient.setQueryData(["plans", "files"], s(planFiles));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className={styles.page}>
        <PageHeader title="Plans" />
        <UploadDropzone />
        <Suspense fallback={<PlansListSkeleton />}>
          <PlansList />
        </Suspense>
      </div>
    </HydrationBoundary>
  );
}
```

- [ ] **Step 3: Add `plans/loading.tsx`**

```tsx
// src/app/(app)/plans/loading.tsx
import { PlansListSkeleton } from "@/components/skeletons/plans-list-skeleton";
import styles from "./plans.module.scss";

export default function PlansLoading() {
  return (
    <div className={styles.page}>
      <PlansListSkeleton />
    </div>
  );
}
```

- [ ] **Step 4: Verify `/plans` in browser**

Expected: plan list renders immediately with real data. Uploading a file (UploadDropzone) still works. Activating/archiving a plan still works via the existing `/api/plans/*` routes and `invalidateQueries`.

---

## Task 7: Convert `plans/[id]/page.tsx` to server component + HydrationBoundary

`PlanDetailContent` uses `useSearchParams()` — it must stay as a client component. The server page reads `searchParams.week` to pre-fetch the right week's workouts.

**Files:**
- Create: `src/app/(app)/plans/[id]/plan-detail-content.tsx`
- Rewrite: `src/app/(app)/plans/[id]/page.tsx`

- [ ] **Step 1: Create `plan-detail-content.tsx` — extract `PlanDetailContent` and `PlanWeek`**

```tsx
// src/app/(app)/plans/[id]/plan-detail-content.tsx
"use client";

import { notFound, useSearchParams } from "next/navigation";
import type { PlanRow, WorkoutRow } from "@/types/plans";
import { addDays, mondayOf, todayIso, isIsoDate } from "@/lib/dates";
import { planNavBounds } from "@/lib/plan-nav";
import { useWorkoutSheet } from "@/lib/use-workout-sheet";
import { PlanView } from "@/components/plans/plan-view";
import { PlanStatusActions } from "@/components/plans/plan-status-actions";
import { WorkoutDetailSheet } from "@/components/workouts/workout-detail-sheet";
import { CoachLink } from "@/components/layout/coach-link";
import { usePreferences } from "@/queries/preferences";
import { usePlan, usePlanWorkouts } from "@/queries/plans";

interface PlanDetailContentProps {
  planId: string;
}

export function PlanDetailContent({ planId }: PlanDetailContentProps) {
  const searchParams = useSearchParams();
  const week = searchParams.get("week");

  const { data: prefs } = usePreferences();
  const { data: plan } = usePlan(planId);
  const { data: allWorkouts } = usePlanWorkouts(planId);

  if (!plan) notFound();

  const today = todayIso(prefs.timezone);

  const { firstMonday: planFirstMonday, lastMonday: planLastMonday } = planNavBounds(
    plan.start_date,
    plan.end_date,
    mondayOf(today)
  );
  const defaultMonday =
    planLastMonday == null || mondayOf(today) <= planLastMonday
      ? mondayOf(today) >= planFirstMonday
        ? mondayOf(today)
        : planFirstMonday
      : planLastMonday;

  const monday = isIsoDate(week) ? mondayOf(week) : defaultMonday;

  const { prevDisabled, nextDisabled } = planNavBounds(plan.start_date, plan.end_date, monday);
  const isCurrentWeek = monday === mondayOf(today);

  return (
    <PlanWeek
      plan={plan}
      allWorkouts={allWorkouts}
      monday={monday}
      prevHref={prevDisabled ? null : `/plans/${planId}?week=${addDays(monday, -7)}`}
      nextHref={nextDisabled ? null : `/plans/${planId}?week=${addDays(monday, 7)}`}
      todayHref={`/plans/${planId}`}
      isCurrentWeek={isCurrentWeek}
      today={today}
      units={prefs.units}
    />
  );
}

interface PlanWeekProps {
  plan: PlanRow;
  allWorkouts: WorkoutRow[];
  monday: string;
  prevHref: string | null;
  nextHref: string | null;
  todayHref: string;
  isCurrentWeek: boolean;
  today: string;
  units: "mi" | "km";
}

function PlanWeek({
  plan,
  allWorkouts,
  monday,
  prevHref,
  nextHref,
  todayHref,
  isCurrentWeek,
  today,
  units,
}: PlanWeekProps) {
  const sheet = useWorkoutSheet((date) => allWorkouts.find((w) => w.date === date));

  return (
    <>
      <PlanView
        plan={plan}
        today={today}
        units={units}
        allWorkouts={allWorkouts}
        headerActions={<PlanStatusActions plan={plan} today={today} />}
        subheaderAction={<CoachLink />}
        currentWeek={{
          monday,
          prev: prevHref ? { href: prevHref } : { disabled: true },
          next: nextHref ? { href: nextHref } : { disabled: true },
          todayNav: { href: todayHref },
          showToday: !isCurrentWeek,
          isActivePlan: plan.is_active,
          onWorkoutClick: sheet.open,
        }}
      />
      <WorkoutDetailSheet
        workout={sheet.openWorkout}
        planId={plan.id}
        units={units}
        onClose={sheet.close}
      />
    </>
  );
}
```

- [ ] **Step 2: Rewrite `plans/[id]/page.tsx` as a server component**

```tsx
// src/app/(app)/plans/[id]/page.tsx
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getPlanById } from "@/server/plans/queries";
import { getWorkoutsForPlan } from "@/server/plans/date-queries";
import { PlanDetailContent } from "./plan-detail-content";
import styles from "./plan-detail.module.scss";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PlanDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;

  const { id: planId } = await params;

  const [plan, allWorkouts] = await Promise.all([
    getPlanById(planId, userId),
    getWorkoutsForPlan(planId),
  ]);

  if (!plan) notFound();

  const queryClient = new QueryClient();
  const s = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["plans", planId], s(plan));
  queryClient.setQueryData(["plans", planId, "workouts"], s(allWorkouts));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className={styles.page}>
        <PlanDetailContent planId={planId} />
      </div>
    </HydrationBoundary>
  );
}
```

- [ ] **Step 3: Add `plans/[id]/loading.tsx`**

```tsx
// src/app/(app)/plans/[id]/loading.tsx
import { WeekAgendaSkeleton } from "@/components/skeletons/week-agenda-skeleton";
import styles from "./plan-detail.module.scss";

export default function PlanDetailLoading() {
  return (
    <div className={styles.page}>
      <WeekAgendaSkeleton />
    </div>
  );
}
```

- [ ] **Step 4: Verify `/plans/[id]` in browser**

Expected: plan detail renders immediately. Week navigation and workout detail sheet still work. Activating/archiving a plan triggers `invalidateQueries` and refetches correctly.

---

## Task 8: Convert `settings/page.tsx` to server component + HydrationBoundary

Settings has no inline client component to extract — `SettingsForm` is already in its own file. The page only needs `"use client"` removed and `CSRSuspense` replaced with `Suspense`.

**Files:**
- Rewrite: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Rewrite `settings/page.tsx` as a server component**

Coach notes are stored in `users.coach_notes` (not in the auth session), so we query them inline.

```tsx
// src/app/(app)/settings/page.tsx
import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/get-session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { SettingsForm } from "./settings-form";
import { Button } from "@/components/button/button";
import { signOutAction } from "@/app/_actions/sign-out";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsFormSkeleton } from "@/components/skeletons/settings-form-skeleton";
import styles from "./settings.module.scss";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;

  const [row] = await db
    .select({ coach_notes: users.coach_notes })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const coachNotes = row?.coach_notes ?? "";

  const queryClient = new QueryClient();
  const s = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["coach", "notes"], s(coachNotes));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className={styles.page}>
        <PageHeader title="Settings" />
        <div className={styles.scrollArea}>
          <Suspense fallback={<SettingsFormSkeleton />}>
            <SettingsForm />
          </Suspense>
          <form action={signOutAction} className={styles.signOut}>
            <Button type="submit" variant="danger">
              Log out
            </Button>
          </form>
        </div>
      </div>
    </HydrationBoundary>
  );
}
```

- [ ] **Step 2: Add `settings/loading.tsx`**

```tsx
// src/app/(app)/settings/loading.tsx
import { SettingsFormSkeleton } from "@/components/skeletons/settings-form-skeleton";
import styles from "./settings.module.scss";

export default function SettingsLoading() {
  return (
    <div className={styles.page}>
      <SettingsFormSkeleton />
    </div>
  );
}
```

- [ ] **Step 3: Verify settings page in browser**

Expected: form renders with current preferences pre-filled immediately. Saving preferences and coach notes still works via mutations.

---

## Task 9: Convert `coach/page.tsx` to server component + HydrationBoundary

`CoachContent` uses `useSearchParams()` — it moves to its own file. The server page reads `searchParams` to pre-fetch messages for the correct plan context.

**Files:**
- Create: `src/app/(app)/coach/coach-content.tsx`
- Rewrite: `src/app/(app)/coach/page.tsx`

- [ ] **Step 1: Create `coach-content.tsx` — extract `CoachContent` and `CoachWithPlanLabel`**

```tsx
// src/app/(app)/coach/coach-content.tsx
"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CoachPageClient } from "./coach-page-client";
import { useCoachMessages } from "@/queries/coach-messages";
import { usePlan } from "@/queries/plans";
import type { StoredMessage } from "@/types/coach";

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAN_FROM_RE = new RegExp(`^/plans/(${UUID_RE})$`);

export function CoachContent() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? undefined;
  const fromLabelParam = searchParams.get("from_label") ?? undefined;
  const planFileId = searchParams.get("plan_file_id") ?? undefined;
  const intent = searchParams.get("intent") ?? undefined;
  const planIdParam = searchParams.get("plan_id");

  const planId = useMemo<string | null>(() => {
    if (planIdParam) return planIdParam;
    if (from) {
      const match = from.match(PLAN_FROM_RE);
      if (match) return match[1];
    }
    return null;
  }, [planIdParam, from]);

  const { data: messages } = useCoachMessages(planId);

  if (planId === null || fromLabelParam !== undefined) {
    return (
      <CoachPageClient
        initialMessages={messages}
        fromRoute={from}
        fromLabel={fromLabelParam}
        planId={planId}
        planFileId={planFileId}
        intent={intent}
      />
    );
  }

  return (
    <CoachWithPlanLabel
      planId={planId}
      messages={messages}
      from={from}
      planFileId={planFileId}
      intent={intent}
    />
  );
}

interface CoachWithPlanLabelProps {
  planId: string;
  messages: StoredMessage[];
  from: string | undefined;
  planFileId: string | undefined;
  intent: string | undefined;
}

function CoachWithPlanLabel({
  planId,
  messages,
  from,
  planFileId,
  intent,
}: CoachWithPlanLabelProps) {
  const { data: plan } = usePlan(planId);
  return (
    <CoachPageClient
      initialMessages={messages}
      fromRoute={from}
      fromLabel={plan?.title}
      planId={planId}
      planFileId={planFileId}
      intent={intent}
    />
  );
}
```

- [ ] **Step 2: Rewrite `coach/page.tsx` as a server component**

```tsx
// src/app/(app)/coach/page.tsx
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getPlanById } from "@/server/plans/queries";
import { loadHistory } from "@/server/coach/messages";
import { CoachContent } from "./coach-content";

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAN_FROM_RE = new RegExp(`^/plans/(${UUID_RE})$`);

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CoachPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;

  const params = await searchParams;
  const planIdParam = typeof params.plan_id === "string" ? params.plan_id : null;
  const from = typeof params.from === "string" ? params.from : null;
  const planId =
    planIdParam ?? (from ? (from.match(PLAN_FROM_RE)?.[1] ?? null) : null);

  const [messages, plan] = await Promise.all([
    loadHistory(userId, planId),
    planId ? getPlanById(planId, userId) : Promise.resolve(null),
  ]);

  const queryClient = new QueryClient();
  const s = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["coach", "messages", planId], s(messages));
  if (planId && plan) {
    queryClient.setQueryData(["plans", planId], s(plan));
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CoachContent />
    </HydrationBoundary>
  );
}
```

- [ ] **Step 3: Add `coach/loading.tsx`**

```tsx
// src/app/(app)/coach/loading.tsx
import { MessagesSkeleton } from "@/components/skeletons/messages-skeleton";

export default function CoachLoading() {
  return <MessagesSkeleton />;
}
```

- [ ] **Step 4: Verify coach page in browser**

Expected: messages render immediately. Sending a new message (streaming response) still works. Navigating to `/coach?plan_id=<uuid>` pre-loads the correct plan's messages.

---

## Self-Review

**Spec coverage check:**

| Requirement | Task(s) |
|---|---|
| Eliminate double `auth()` per nav | Task 1 |
| Serve real data on initial render (no skeleton flash) | Tasks 3–9 |
| Keep mutations (`invalidateQueries`) working | Preserved — API routes unchanged, cache populated with same keys |
| Remove CSRSuspense from main pages | Tasks 3–9 (replaced with `Suspense`) |
| Add loading states per route | Tasks 4, 5, 6, 7, 8, 9 |
| Fix ReactQueryDevtools in production | Task 2 |
| Preferences from session (no extra DB call) | Tasks 3–9 (`session.user.preferences`) |
| Date serialization correctness | Documented in Architecture section, applied in all `setQueryData` calls |

**CSRSuspense remaining:** Still used in `plans/upload/[id]/review/page.tsx` and `components/preferences-capture.tsx` — both are out of scope for this plan.

**API routes:** All remain unchanged. They continue to serve client-side refetches and mutations.

**Type note:** `PlanRow.created_at` and `updated_at` are `Date` in the TypeScript type but the pre-existing API code already had a mismatch (JSON serialization silently converts to strings). The `JSON.parse(JSON.stringify(...))` step in each page normalizes this to match runtime API behavior.
