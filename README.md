# Race Horse

A personal training-plan tracker with an AI coach. Build and manage running and cycling training plans, track workouts against your Strava data, and chat with a coach powered by Claude.

---

## What it does

- **Training plans** — create goal-based (race date) or indefinite plans for running or cycling. Each plan has a weekly schedule of typed workouts (easy, long, tempo, threshold, intervals, recovery, race, cross-training, rest).
- **AI coach** — a Claude-powered chat interface that builds plans, modifies workouts, analyzes your Strava data, and writes durable coaching notes about you.
- **Strava integration** — automatically syncs your activities in the background and matches them to planned workouts. The coach reads your lap data to anchor pace prescriptions to what you've actually executed.
- **Plan import** — upload an existing plan as a PDF or image; Claude extracts it into the structured workout format.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | Neon (serverless Postgres) |
| ORM | Drizzle ORM |
| Auth | NextAuth.js (OAuth via Strava) |
| AI | Anthropic Claude (claude-opus-4-6) |
| Data fetching | TanStack Query (React Query) |
| Deployment | Vercel (serverless) |

---

## Architecture

### Rendering model

Every page is a **server component** that pre-fetches its data and seeds a React Query cache via `HydrationBoundary`. The client component beneath it reads from that pre-populated cache and never suspends on first load.

```
GET /today
  └─ TodayPage (server component)
       ├─ getActivePlan()           ─┐
       ├─ getWorkoutsForDateRange()  ├─ Promise.all → populate QueryClient
       ├─ getActivitiesForDateRange()│
       └─ getNextWorkouts()         ─┘
            └─ <HydrationBoundary state={dehydrate(queryClient)}>
                 └─ TodayContent (client component)
                      └─ useWorkouts() ← reads pre-populated cache, no network call
```

`<Suspense>` + skeleton components fire on week navigation in `/training` (new week = cache miss = client fetch) and on the route-level `loading.tsx` files that cover the server component's own DB query time.

### Database schema

Nine tables managed with Drizzle migrations:

- **user** — profile, preferences (units/timezone/pace format), cross-plan coach notes, last Strava sync timestamp
- **account / session / verificationToken** — NextAuth adapter tables
- **plan** — training plan (sport, mode, goal, date range, active flag, generation status, per-plan coach notes)
- **workout** — individual workout day (type, date, distance, duration, target intensity, interval spec, notes, optional secondary workout for doubles)
- **activity** — normalized Strava activity (distance, time, HR, pace, power, elevation, raw JSON)
- **activity_lap** — per-lap splits for hard efforts (used by the coach for pace anchoring)
- **message** — full Anthropic content-block conversation history, scoped to user + plan
- **plan_file** — uploaded plan files (blob URL, extraction status, extracted payload)

A partial unique index on `plan.is_active` enforces one active plan per user at the DB level.

### Strava integration

**Initial sync:** On first app load after signup, the layout detects `last_synced_at IS NULL` and fires a 90-day backfill via Next.js `after()` — a post-response background callback that doesn't block page delivery.

**Ongoing sync:** Each app layout render queues an incremental sync via `after()` if `last_synced_at` is stale.

**Webhook:** Strava pushes activity create/update/delete events to `/api/strava/webhook`. The handler upserts or removes the activity and its laps in real time.

**Lap fetching:** Summary activities from the list endpoint lack lap data. When the coach calls `get_activity_laps`, the server fetches the detailed activity from Strava, normalizes and stores the laps, then returns them.

### AI coach

The coach is a streaming agentic loop in `src/server/coach/runner.ts`:

1. Build a context prefix (today's date, units, active plan summary, coach notes, cold-start flags) and prepend it to the user message.
2. Load full conversation history from the `message` table, scoped to the current plan.
3. Call the Anthropic streaming API with the system prompt, tools, and history.
4. Stream text deltas to the client via SSE. On `tool_use`, execute the handler, persist the tool result, and continue the loop.
5. On `end_turn`, persist the final assistant message and yield a `done` event.

**Token optimization:**
- System prompt has a `cache_control` breakpoint — tools + system are cached and not re-charged on each agentic loop iteration.
- Second-to-last message gets a cache breakpoint each turn, caching stable conversation history.
- Tool payloads older than 8 messages are truncated to 3,000 characters — plan builds produce large JSON the model doesn't need verbatim from 10 turns ago.
- System prompt is static (no per-user content, no timestamps) so it's cache-stable across all users.

**Tools:**

| Category | Tools |
|---|---|
| Plans | `get_active_plan`, `list_plans`, `get_plan`, `create_plan`, `update_workouts`, `set_active_plan`, `archive_plan`, `finalize_plan` |
| Activities | `get_recent_activities`, `get_activity_laps`, `update_activity_match`, `get_athlete_summary` |
| Notes | `update_coach_notes`, `update_plan_notes` |
| Files | `read_uploaded_file` |
| Built-in | `web_search` (Anthropic-hosted) |

Cold-start builds (new plan creation) get a restricted tool set — plan-read and plan-management tools are stripped so the coach can't read or modify the existing active plan mid-build.

**Durable memory — two tiers:**
- **General notes** (`update_coach_notes`) — cross-plan facts: injuries, lifestyle constraints, long-term goals. Written to `users.coach_notes`.
- **Plan notes** (`update_plan_notes`) — block-specific facts: goal event, target time, in-block adjustments. Written to `plans.coach_notes`.

### API routes

```
/api/auth/[...nextauth]        NextAuth OAuth + session
/api/preferences               GET/PATCH user preferences
/api/plans                     GET list / POST create
/api/plans/[id]                GET / PATCH / DELETE
/api/plans/[id]/workouts       GET workouts for a plan
/api/plans/[id]/export         GET plan as structured export
/api/plans/active              GET active plan
/api/plans/upload              POST initiate upload
/api/plans/upload/[id]         GET status
/api/plans/upload/[id]/file    PUT blob upload
/api/plans/upload/[id]/extract POST trigger extraction
/api/plans/upload/[id]/save    POST save extracted plan
/api/plans/files               GET in-flight uploads
/api/workouts                  GET by date range or next N
/api/activities                GET by date range
/api/coach/chat                POST streaming coach turn (SSE)
/api/coach/build               POST initiate cold-start build
/api/coach/messages            GET conversation history
/api/coach/notes               GET/PATCH coach notes
/api/strava/sync               POST trigger incremental sync
/api/strava/sync-status        GET last sync timestamp
/api/strava/subscribe          POST register webhook
/api/strava/webhook            GET verify / POST events
```

---

## Project structure

```
src/
  app/
    (app)/              App pages (auth-gated layout)
      today/            Dashboard — today's workout + activities
      training/         Weekly agenda with week navigation
      plans/            Plan list + upload dropzone
      plans/[id]/       Plan detail with full workout calendar
      coach/            AI coach chat
      settings/         User preferences
    api/                API route handlers
  server/
    coach/              Coach runner, system prompt, tools, context
    db/                 Drizzle schema + client
    plans/              Plan and workout query functions
    strava/             Strava API client, sync, webhook, normalization
  components/           Shared UI components
  queries/              React Query hooks (client-side)
  lib/                  Utilities (dates, formatting, session)
  types/                Shared TypeScript types
```

---

## Local development

```bash
# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env.local
# Required: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL,
#           STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET,
#           ANTHROPIC_API_KEY

# Run database migrations
npm run db:migrate

# Start dev server
npm run dev
```

```bash
# Run tests
npm test

# Type check
npm run typecheck
```
