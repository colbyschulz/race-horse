# Streaming RSC with Suspense — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace monolithic server-side data-fetching in every page with async Server Components wrapped in Suspense, so page shells paint immediately on navigation and data sections stream in behind skeleton placeholders.

**Architecture:** Each page function does only `auth()` + a small number of fast queries needed by the shell, then renders the static shell immediately. Slow data sections become dedicated async Server Components (e.g. `HeroSection`, `WeekAgendaSection`) that are each wrapped in `<Suspense fallback={<Skeleton />}>`. `loading.tsx` is deleted — without it, Next.js holds the previous page visible during client-side navigation until the shell is ready (~50ms), which is a better UX than a loading flash.

**Tech Stack:** Next.js App Router (React Server Components, Suspense), TypeScript, CSS Modules

---

## File Map

**New files — skeleton primitive:**

- `src/components/skeletons/Skeleton.tsx` — pulsing gray block, sized via props
- `src/components/skeletons/Skeleton.module.scss` — pulse animation

**New files — Today page sections:**

- `src/app/(app)/today/HeroSection.tsx` — async SC: fetches today's workouts, renders HeroWorkout or rest card
- `src/app/(app)/today/HeroSkeleton.tsx` — skeleton for hero card
- `src/app/(app)/today/ActivitiesSection.tsx` — async SC: fetches today's activities
- `src/app/(app)/today/ActivitiesSkeleton.tsx` — skeleton for activities list
- `src/app/(app)/today/UpNextSection.tsx` — async SC: fetches next 2 workouts
- `src/app/(app)/today/UpNextSkeleton.tsx` — skeleton for up-next rows

**New files — Training page:**

- `src/app/(app)/training/WeekAgendaSection.tsx` — async SC: fetches workouts + activities, renders TrainingClient
- `src/app/(app)/training/WeekAgendaSkeleton.tsx` — skeleton for week view

**New files — Plans page:**

- `src/app/(app)/plans/PlansListSection.tsx` — async SC: fetches plans + in-flight files, renders PlansPageClient
- `src/app/(app)/plans/PlansListSkeleton.tsx` — skeleton for plans list

**New files — Plan Detail page:**

- `src/app/(app)/plans/[id]/PlanWeekSection.tsx` — async SC: fetches workouts + activities, renders PlanDetailClient

**New files — Settings page:**

- `src/app/(app)/settings/CoachNotesSection.tsx` — async SC: fetches coach_notes, renders CoachNotesEditor
- `src/app/(app)/settings/CoachNotesSkeleton.tsx` — skeleton for textarea-shaped block

**New files — Coach page:**

- `src/app/(app)/coach/MessagesSection.tsx` — async SC: loads message history, renders CoachPageClient
- `src/app/(app)/coach/MessagesSkeleton.tsx` — skeleton for chat bubbles

**Modified files:**

- `src/app/(app)/today/page.tsx` — remove data queries, add Suspense sections
- `src/app/(app)/training/page.tsx` — remove slow queries, add Suspense section
- `src/app/(app)/plans/page.tsx` — remove data queries, add Suspense section
- `src/app/(app)/plans/[id]/page.tsx` — remove slow queries, add Suspense section
- `src/app/(app)/settings/page.tsx` — remove coach_notes query, add Suspense section
- `src/app/(app)/coach/page.tsx` — remove loadHistory, add Suspense section

**Deleted files:**

- `src/app/(app)/loading.tsx`

---

## Task 1: Skeleton Primitive

**Files:**

- Create: `src/components/skeletons/Skeleton.module.scss`
- Create: `src/components/skeletons/Skeleton.tsx`

- [ ] **Step 1: Create `Skeleton.module.scss`**

```scss
.skeleton {
  background: var(--color-bg-secondary);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
```

- [ ] **Step 2: Create `Skeleton.tsx`**

```tsx
import type { CSSProperties } from "react";
import styles from "./Skeleton.module.scss";

interface Props {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = "var(--radius-sm)",
  className,
  style,
}: Props) {
  return (
    <div
      className={`${styles.skeleton}${className ? ` ${className}` : ""}`}
      style={{ width, height, borderRadius, ...style }}
    />
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/skeletons/
git commit -m "Add Skeleton primitive with pulse animation"
```

---

## Task 2: Today Page — Streaming Sections

**Files:**

- Create: `src/app/(app)/today/HeroSkeleton.tsx`
- Create: `src/app/(app)/today/HeroSection.tsx`
- Create: `src/app/(app)/today/ActivitiesSkeleton.tsx`
- Create: `src/app/(app)/today/ActivitiesSection.tsx`
- Create: `src/app/(app)/today/UpNextSkeleton.tsx`
- Create: `src/app/(app)/today/UpNextSection.tsx`
- Modify: `src/app/(app)/today/page.tsx`

- [ ] **Step 1: Create `HeroSkeleton.tsx`**

```tsx
import { Skeleton } from "@/components/skeletons/Skeleton";
import styles from "./Today.module.scss";

export function HeroSkeleton() {
  return (
    <article className={styles.hero}>
      <Skeleton width={60} height={22} borderRadius="var(--radius-full)" />
      <Skeleton width="55%" height={52} borderRadius="var(--radius-sm)" />
      <div style={{ display: "flex", gap: "var(--space-4)" }}>
        <Skeleton width={72} height={44} />
        <Skeleton width={72} height={44} />
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Create `HeroSection.tsx`**

```tsx
import { getWorkoutsForDateRange } from "@/plans/dateQueries";
import { todayIso } from "@/lib/dates";
import { HeroWorkout } from "./HeroWorkout";
import styles from "./Today.module.scss";

export async function HeroSection({ userId, units }: { userId: string; units: "mi" | "km" }) {
  const today = todayIso();
  const workouts = await getWorkoutsForDateRange(userId, today, today);
  if (workouts.length === 0) {
    return <div className={styles.restCard}>Rest day. Take it easy.</div>;
  }
  return <HeroWorkout workout={workouts[0]} units={units} />;
}
```

- [ ] **Step 3: Create `ActivitiesSkeleton.tsx`**

```tsx
import { Skeleton } from "@/components/skeletons/Skeleton";
import styles from "./Today.module.scss";

export function ActivitiesSkeleton() {
  return (
    <section className={styles.section}>
      <Skeleton width={120} height={11} />
      <div className={styles.activityList}>
        <Skeleton height={52} borderRadius="var(--radius-md)" />
        <Skeleton height={52} borderRadius="var(--radius-md)" />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create `ActivitiesSection.tsx`**

```tsx
import { getActivitiesForDateRange } from "@/strava/dateQueries";
import { todayIso } from "@/lib/dates";
import { ActivityRow } from "@/components/activities/ActivityRow";
import styles from "./Today.module.scss";

export async function ActivitiesSection({ userId, units }: { userId: string; units: "mi" | "km" }) {
  const today = todayIso();
  const activities = await getActivitiesForDateRange(userId, today, today);
  if (activities.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Today&apos;s activities</h2>
      <div className={styles.activityList}>
        {activities.map((a) => (
          <ActivityRow key={a.id} activity={a} units={units} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create `UpNextSkeleton.tsx`**

```tsx
import { Skeleton } from "@/components/skeletons/Skeleton";
import styles from "./Today.module.scss";

export function UpNextSkeleton() {
  return (
    <section className={styles.upNextSection}>
      <Skeleton width={60} height={11} />
      <ul className={styles.upNextList}>
        <li>
          <Skeleton height={56} borderRadius="var(--radius-md)" />
        </li>
        <li>
          <Skeleton height={56} borderRadius="var(--radius-md)" />
        </li>
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Create `UpNextSection.tsx`**

```tsx
import { getNextWorkouts } from "@/plans/dateQueries";
import { todayIso } from "@/lib/dates";
import { UpNext } from "./UpNext";

export async function UpNextSection({ userId, units }: { userId: string; units: "mi" | "km" }) {
  const today = todayIso();
  const workouts = await getNextWorkouts(userId, today, 2);
  if (workouts.length === 0) return null;
  return <UpNext workouts={workouts} units={units} />;
}
```

- [ ] **Step 7: Replace `today/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getActivePlan } from "@/plans/dateQueries";
import { todayIso, formatLongDate } from "@/lib/dates";
import { HeroSection } from "./HeroSection";
import { HeroSkeleton } from "./HeroSkeleton";
import { ActivitiesSection } from "./ActivitiesSection";
import { ActivitiesSkeleton } from "./ActivitiesSkeleton";
import { UpNextSection } from "./UpNextSection";
import { UpNextSkeleton } from "./UpNextSkeleton";
import { NoActivePlan } from "@/components/plans/NoActivePlan";
import { CoachLink } from "@/components/layout/CoachLink";
import styles from "./Today.module.scss";

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const today = todayIso();

  const [[pref], activePlan] = await Promise.all([
    db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1),
    getActivePlan(userId),
  ]);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <h1 className={styles.date}>{formatLongDate(today)}</h1>
          {activePlan && <p className={styles.planTitle}>{activePlan.title}</p>}
        </div>
        <CoachLink planId={activePlan?.id} />
      </header>

      {!activePlan && <NoActivePlan context="today" />}

      {activePlan && (
        <Suspense fallback={<HeroSkeleton />}>
          <HeroSection userId={userId} units={units} />
        </Suspense>
      )}

      {activePlan && (
        <Suspense fallback={<ActivitiesSkeleton />}>
          <ActivitiesSection userId={userId} units={units} />
        </Suspense>
      )}

      {activePlan && (
        <Suspense fallback={<UpNextSkeleton />}>
          <UpNextSection userId={userId} units={units} />
        </Suspense>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/today/
git commit -m "Stream Today page sections with Suspense"
```

---

## Task 3: Training Page — Streaming Section

**Files:**

- Create: `src/app/(app)/training/WeekAgendaSkeleton.tsx`
- Create: `src/app/(app)/training/WeekAgendaSection.tsx`
- Modify: `src/app/(app)/training/page.tsx`

- [ ] **Step 1: Create `WeekAgendaSkeleton.tsx`**

```tsx
import { Skeleton } from "@/components/skeletons/Skeleton";

export function WeekAgendaSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        padding: "var(--space-4) 0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width={140} height={20} />
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Skeleton width={32} height={32} borderRadius="var(--radius-md)" />
          <Skeleton width={32} height={32} borderRadius="var(--radius-md)" />
          <Skeleton width={56} height={32} borderRadius="var(--radius-md)" />
        </div>
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} height={52} borderRadius="var(--radius-md)" />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `WeekAgendaSection.tsx`**

```tsx
import { getWorkoutsForDateRange } from "@/plans/dateQueries";
import { getActivitiesForDateRange } from "@/strava/dateQueries";
import { TrainingClient } from "./TrainingClient";

interface Props {
  userId: string;
  planId: string;
  planTitle: string;
  monday: string;
  sunday: string;
  weekTitle: string;
  weekRange: string;
  prevHref: string | null;
  nextHref: string;
  todayHref: string;
  isCurrentWeek: boolean;
  today: string;
  units: "mi" | "km";
}

export async function WeekAgendaSection({
  userId,
  planId,
  planTitle,
  monday,
  sunday,
  weekTitle,
  weekRange,
  prevHref,
  nextHref,
  todayHref,
  isCurrentWeek,
  today,
  units,
}: Props) {
  const [workouts, activities] = await Promise.all([
    getWorkoutsForDateRange(userId, monday, sunday),
    getActivitiesForDateRange(userId, monday, sunday),
  ]);
  return (
    <TrainingClient
      planTitle={planTitle}
      monday={monday}
      weekTitle={weekTitle}
      weekRange={weekRange}
      prevHref={prevHref}
      nextHref={nextHref}
      todayHref={todayHref}
      isCurrentWeek={isCurrentWeek}
      workouts={workouts}
      activities={activities}
      today={today}
      units={units}
      activePlanId={planId}
    />
  );
}
```

- [ ] **Step 3: Replace `training/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getActivePlan } from "@/plans/dateQueries";
import { addDays, mondayOf, todayIso } from "@/lib/dates";
import { WeekAgendaSection } from "./WeekAgendaSection";
import { WeekAgendaSkeleton } from "./WeekAgendaSkeleton";
import { NoActivePlan } from "@/components/plans/NoActivePlan";
import styles from "./Calendar.module.scss";

function fmtShortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function weekIndexFromStart(planStart: string, monday: string): number {
  const startMon = mondayOf(planStart);
  const ms = new Date(monday + "T00:00:00").getTime() - new Date(startMon + "T00:00:00").getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const today = todayIso();

  const { week } = await searchParams;
  const monday = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? mondayOf(week) : mondayOf(today);
  const sunday = addDays(monday, 6);

  const [[pref], activePlan] = await Promise.all([
    db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1),
    getActivePlan(userId),
  ]);
  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";

  if (!activePlan) {
    return (
      <div className={styles.page}>
        <NoActivePlan context="calendar" />
      </div>
    );
  }

  const isCurrentWeek = monday === mondayOf(today);
  const planFirstMonday = mondayOf(activePlan.start_date);
  const planLastMonday = activePlan.end_date ? mondayOf(addDays(activePlan.end_date, -1)) : null;
  const insidePlan =
    monday >= planFirstMonday && (planLastMonday == null || monday <= planLastMonday);
  const prevDisabled = monday <= planFirstMonday;

  const weekTitle = insidePlan
    ? `Week ${weekIndexFromStart(activePlan.start_date, monday)}`
    : fmtShortDate(monday);
  const weekRange = `${fmtShortDate(monday)} – ${fmtShortDate(sunday)}`;

  return (
    <div className={styles.page}>
      <Suspense fallback={<WeekAgendaSkeleton />}>
        <WeekAgendaSection
          userId={userId}
          planId={activePlan.id}
          planTitle={activePlan.title}
          monday={monday}
          sunday={sunday}
          weekTitle={weekTitle}
          weekRange={weekRange}
          prevHref={prevDisabled ? null : `/training?week=${addDays(monday, -7)}`}
          nextHref={`/training?week=${addDays(monday, 7)}`}
          todayHref="/training"
          isCurrentWeek={isCurrentWeek}
          today={today}
          units={units}
        />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/training/WeekAgendaSection.tsx src/app/\(app\)/training/WeekAgendaSkeleton.tsx src/app/\(app\)/training/page.tsx
git commit -m "Stream Training page week agenda with Suspense"
```

---

## Task 4: Plans Page — Streaming Section

**Files:**

- Create: `src/app/(app)/plans/PlansListSkeleton.tsx`
- Create: `src/app/(app)/plans/PlansListSection.tsx`
- Modify: `src/app/(app)/plans/page.tsx`

- [ ] **Step 1: Create `PlansListSkeleton.tsx`**

```tsx
import { Skeleton } from "@/components/skeletons/Skeleton";

export function PlansListSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <Skeleton height={88} borderRadius="var(--radius-lg)" />
      <Skeleton height={88} borderRadius="var(--radius-lg)" />
      <Skeleton height={88} borderRadius="var(--radius-lg)" />
    </div>
  );
}
```

- [ ] **Step 2: Create `PlansListSection.tsx`**

```tsx
import { listPlansWithCounts } from "@/plans/queries";
import { listInFlightPlanFiles } from "@/plans/files";
import { PlansPageClient } from "./PlansPageClient";

export async function PlansListSection({ userId, today }: { userId: string; today: string }) {
  const [plans, planFiles] = await Promise.all([
    listPlansWithCounts(userId, today),
    listInFlightPlanFiles(userId),
  ]);
  return <PlansPageClient plans={plans} today={today} planFiles={planFiles} />;
}
```

- [ ] **Step 3: Replace `plans/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { PlansListSection } from "./PlansListSection";
import { PlansListSkeleton } from "./PlansListSkeleton";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PlansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const today = isoToday();

  return (
    <Suspense fallback={<PlansListSkeleton />}>
      <PlansListSection userId={session.user.id} today={today} />
    </Suspense>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/plans/PlansListSection.tsx src/app/\(app\)/plans/PlansListSkeleton.tsx src/app/\(app\)/plans/page.tsx
git commit -m "Stream Plans page list with Suspense"
```

---

## Task 5: Plan Detail Page — Streaming Section

**Files:**

- Create: `src/app/(app)/plans/[id]/PlanWeekSection.tsx`
- Modify: `src/app/(app)/plans/[id]/page.tsx`

Note: PlanWeekSection reuses `WeekAgendaSkeleton` from `src/app/(app)/training/WeekAgendaSkeleton.tsx`.

- [ ] **Step 1: Create `PlanWeekSection.tsx`**

```tsx
import { getWorkoutsForPlan } from "@/plans/dateQueries";
import { getActivitiesForDateRange } from "@/strava/dateQueries";
import { PlanDetailClient } from "./PlanDetailClient";
import type { Plan } from "@/plans/types";

interface Props {
  plan: Plan;
  userId: string;
  monday: string;
  sunday: string;
  prevHref: string | null;
  nextHref: string | null;
  todayHref: string;
  isCurrentWeek: boolean;
  today: string;
  units: "mi" | "km";
}

export async function PlanWeekSection({
  plan,
  userId,
  monday,
  sunday,
  prevHref,
  nextHref,
  todayHref,
  isCurrentWeek,
  today,
  units,
}: Props) {
  const [allWorkouts, weekActivities] = await Promise.all([
    getWorkoutsForPlan(plan.id),
    getActivitiesForDateRange(userId, monday, sunday),
  ]);
  return (
    <PlanDetailClient
      plan={plan}
      monday={monday}
      prevHref={prevHref}
      nextHref={nextHref}
      todayHref={todayHref}
      isCurrentWeek={isCurrentWeek}
      allWorkouts={allWorkouts}
      weekActivities={weekActivities}
      today={today}
      units={units}
    />
  );
}
```

- [ ] **Step 2: Replace `plans/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getPlanById } from "@/plans/queries";
import { addDays, mondayOf, todayIso } from "@/lib/dates";
import { PlanWeekSection } from "./PlanWeekSection";
import { WeekAgendaSkeleton } from "@/app/(app)/training/WeekAgendaSkeleton";
import styles from "./PlanDetail.module.scss";

export default async function PlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const { id } = await params;
  const { week } = await searchParams;

  const [[pref], plan] = await Promise.all([
    db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1),
    getPlanById(id, userId),
  ]);
  if (!plan) notFound();

  const units = (pref?.preferences?.units === "km" ? "km" : "mi") as "mi" | "km";
  const today = todayIso();
  const planFirstMonday = mondayOf(plan.start_date);
  const planLastMonday = plan.end_date ? mondayOf(addDays(plan.end_date, -1)) : null;

  const defaultMonday =
    planLastMonday == null || mondayOf(today) <= planLastMonday
      ? mondayOf(today) >= planFirstMonday
        ? mondayOf(today)
        : planFirstMonday
      : planLastMonday;

  const monday = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? mondayOf(week) : defaultMonday;
  const sunday = addDays(monday, 6);

  const prevDisabled = monday <= planFirstMonday;
  const nextDisabled = !!planLastMonday && monday >= planLastMonday;
  const isCurrentWeek = monday === mondayOf(today);

  return (
    <div className={styles.page}>
      <Suspense fallback={<WeekAgendaSkeleton />}>
        <PlanWeekSection
          plan={plan}
          userId={userId}
          monday={monday}
          sunday={sunday}
          prevHref={prevDisabled ? null : `/plans/${id}?week=${addDays(monday, -7)}`}
          nextHref={nextDisabled ? null : `/plans/${id}?week=${addDays(monday, 7)}`}
          todayHref={`/plans/${id}`}
          isCurrentWeek={isCurrentWeek}
          today={today}
          units={units}
        />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/plans/[id]/PlanWeekSection.tsx" "src/app/(app)/plans/[id]/page.tsx"
git commit -m "Stream Plan Detail page week section with Suspense"
```

---

## Task 6: Settings Page — Streaming Section

**Files:**

- Create: `src/app/(app)/settings/CoachNotesSkeleton.tsx`
- Create: `src/app/(app)/settings/CoachNotesSection.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create `CoachNotesSkeleton.tsx`**

```tsx
import { Skeleton } from "@/components/skeletons/Skeleton";

export function CoachNotesSkeleton() {
  return <Skeleton height={160} borderRadius="var(--radius-md)" />;
}
```

- [ ] **Step 2: Create `CoachNotesSection.tsx`**

```tsx
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { CoachNotesEditor } from "@/components/coach/CoachNotesEditor";

export async function CoachNotesSection({ userId }: { userId: string }) {
  const rows = await db
    .select({ coach_notes: users.coach_notes })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const coachNotes = rows[0]?.coach_notes ?? "";
  return <CoachNotesEditor initialContent={coachNotes} />;
}
```

- [ ] **Step 3: Replace `settings/page.tsx`**

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SettingsForm } from "./SettingsForm";
import { CoachNotesSection } from "./CoachNotesSection";
import { CoachNotesSkeleton } from "./CoachNotesSkeleton";
import styles from "./Settings.module.scss";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className={styles.page}>
      <h1 className={styles.header}>Settings</h1>
      <SettingsForm initial={session.user.preferences} />
      <Suspense fallback={<CoachNotesSkeleton />}>
        <CoachNotesSection userId={session.user.id!} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/settings/CoachNotesSkeleton.tsx src/app/\(app\)/settings/CoachNotesSection.tsx src/app/\(app\)/settings/page.tsx
git commit -m "Stream Settings page coach notes with Suspense"
```

---

## Task 7: Coach Page — Streaming Section

**Files:**

- Create: `src/app/(app)/coach/MessagesSkeleton.tsx`
- Create: `src/app/(app)/coach/MessagesSection.tsx`
- Modify: `src/app/(app)/coach/page.tsx`

- [ ] **Step 1: Create `MessagesSkeleton.tsx`**

```tsx
import { Skeleton } from "@/components/skeletons/Skeleton";

export function MessagesSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Skeleton width="60%" height={44} borderRadius="var(--radius-lg)" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <Skeleton width="75%" height={72} borderRadius="var(--radius-lg)" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Skeleton width="45%" height={44} borderRadius="var(--radius-lg)" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <Skeleton width="70%" height={56} borderRadius="var(--radius-lg)" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `MessagesSection.tsx`**

```tsx
import { loadHistory } from "@/coach/messages";
import { CoachPageClient } from "./CoachPageClient";

interface Props {
  userId: string;
  planId: string | null;
  fromRoute: string | undefined;
  fromLabel: string | undefined;
  planFileId: string | undefined;
  intent: string | undefined;
}

export async function MessagesSection({
  userId,
  planId,
  fromRoute,
  fromLabel,
  planFileId,
  intent,
}: Props) {
  const messages = await loadHistory(userId, planId);
  return (
    <CoachPageClient
      initialMessages={messages}
      fromRoute={fromRoute}
      fromLabel={fromLabel}
      planId={planId}
      planFileId={planFileId}
      intent={intent}
    />
  );
}
```

- [ ] **Step 3: Replace `coach/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { getPlanById } from "@/plans/queries";
import { MessagesSection } from "./MessagesSection";
import { MessagesSkeleton } from "./MessagesSkeleton";

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAN_FROM_RE = new RegExp(`^/plans/(${UUID_RE})$`);

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    from_label?: string;
    plan_file_id?: string;
    intent?: string;
    plan_id?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const { from, from_label, plan_file_id, intent, plan_id } = await searchParams;

  let fromLabel: string | undefined = from_label;
  let planId: string | null = plan_id ?? null;

  if (planId) {
    const plan = await getPlanById(planId, userId);
    if (plan) fromLabel = fromLabel ?? plan.title;
  } else if (from) {
    const planMatch = from.match(PLAN_FROM_RE);
    if (planMatch) {
      planId = planMatch[1];
      if (!fromLabel) {
        const plan = await getPlanById(planId, userId);
        if (plan) fromLabel = plan.title;
      }
    }
  }

  return (
    <Suspense fallback={<MessagesSkeleton />}>
      <MessagesSection
        userId={userId}
        planId={planId}
        fromRoute={from}
        fromLabel={fromLabel}
        planFileId={plan_file_id}
        intent={intent}
      />
    </Suspense>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/coach/MessagesSkeleton.tsx src/app/\(app\)/coach/MessagesSection.tsx src/app/\(app\)/coach/page.tsx
git commit -m "Stream Coach page message history with Suspense"
```

---

## Task 8: Delete `loading.tsx` + Final Verification

**Files:**

- Delete: `src/app/(app)/loading.tsx`

- [ ] **Step 1: Delete `loading.tsx`**

```bash
rm src/app/\(app\)/loading.tsx
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass (no test files touch the deleted file or modified pages).

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`) and verify each page:

- Navigate Today → Training → Plans → Plan Detail → Coach → Settings
- Confirm: previous page stays visible briefly, shell appears, skeletons flash in then real content arrives
- Confirm: hard-refresh on each page renders correctly (no blank screen issues)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Delete loading.tsx — shells now render immediately via Suspense"
```
