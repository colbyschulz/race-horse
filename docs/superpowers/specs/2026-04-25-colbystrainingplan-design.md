# colbystrainingplan.com — Design Spec

**Date:** 2026-04-25
**Status:** Draft for review
**Author:** Colby Schulz (with Claude)

## 1. Summary

A virtual running and cycling coach. Users authenticate with Strava, then chat with a Claude-powered coach who can build new training plans from scratch, tweak existing plans, ingest plans uploaded as PDF / spreadsheet / markdown, answer training questions (including product / gear / race research via web search), and analyze completed workouts pulled from Strava (including lap-by-lap detail).

Plans are highly structured (typed workouts, target intensities, intervals, HR zones, RPE) so the coach can reason over them and the UI can render rich Today / Calendar views.

The product is **free**, **public**, **multi-tenant**, and **gated to athletes who use Strava** (the auth path *is* the integration). Target audience is advanced athletes — the kind of runner or cyclist who already thinks in pace zones, FTP, threshold, etc.

## 2. Non-goals (v1)

- Manual workout entry — the **only** way to modify a plan is through the coach (or by uploading a new file).
- Manual completion logging — completion data comes from Strava only.
- Triathlon / multi-sport plans (single plan = single sport; tri athletes maintain two plans).
- Email/push notifications.
- Public profiles, plan sharing, leaderboards, social features.
- Compaction (defer until conversations exceed practical context length).
- Per-second activity streams (laps are enough for v1 analysis).
- Cross-conversation memory beyond what the DB stores.
- Apple Health / Garmin / Polar / Suunto integrations.

## 3. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | SCSS Modules + Radix UI Primitives + custom design system |
| Auth | NextAuth.js v5 with Strava as the only provider |
| Database | Neon Postgres |
| ORM | Drizzle |
| File storage | Vercel Blob (for uploaded plan files) |
| LLM | Anthropic SDK in Next.js API routes — `claude-opus-4-7` |
| Hosting | Vercel |
| Domain | colbystrainingplan.com |

### Why Neon over Supabase

We're using NextAuth (not Supabase Auth) and Vercel Blob (not Supabase Storage), so we'd only be using Supabase as a Postgres host. Neon is a focused Postgres-only product with first-class Vercel integration, generous free tier, and database branching (per-Vercel-preview DB forks).

### Why Drizzle over Prisma

Drizzle is TypeScript-first with a tiny runtime and effectively zero serverless cold-start cost. Prisma is more mature but historically heavier on serverless. For a greenfield Vercel project, Drizzle is the modern default.

## 4. Routes

### Pages

| Route | Purpose |
|---|---|
| `/` | Marketing landing + "Sign in with Strava" |
| `/today` | Today's workout, plus Strava match if available |
| `/calendar` | Week (default on mobile) / Month (default on desktop) calendar of the active plan |
| `/plans` | Manage page — list of plans, set active, archive, delete, upload |
| `/coach` | Full-screen coach chat (also accessible as slide-up sheet from any view) |

### API routes

| Route | Purpose |
|---|---|
| `/api/auth/*` | NextAuth (Strava OAuth) |
| `/api/coach/chat` | Streaming chat endpoint (Server-Sent Events) with Claude + tool use |
| `/api/plans` | GET list, GET by id, POST update-active, DELETE |
| `/api/plans/upload` | Receives file → Vercel Blob → kicks off LLM extraction job |
| `/api/plans/upload/:id` | Status poll for extraction job |
| `/api/strava/webhook` | Strava activity webhook receiver |
| `/api/strava/sync` | Manual sync trigger (7-day backfill) |

### Server-side modules

- `coach/` — system prompt, tool definitions, message persistence, streaming
- `plans/` — schema operations (create, update workouts, set active, archive, delete)
- `extraction/` — LLM-based parsing of uploaded plans into the workout schema
- `strava/` — OAuth token refresh, activity fetching, lap fetching, webhook signature/subscription handling, workout matching

## 5. Navigation pattern

**Mobile-first.** Bottom tab bar with **Today / Calendar / Plans**. A persistent floating "Ask coach" button (bottom-right) opens the coach as a slide-up sheet. The coach is always one click away from any view.

**Desktop:** sidebar with the same three items, and the coach opens as a right-side panel.

## 6. Data model

NextAuth's Drizzle adapter manages `users`, `accounts` (which holds Strava `access_token` + `refresh_token` + `expires_at`), `sessions`, and `verification_tokens`.

We extend `users` with a `preferences` jsonb column for per-user app preferences:

```ts
{
  units: "mi" | "km",          // default: "mi"
  timezone: string,            // IANA tz, e.g. "America/Los_Angeles" — captured from browser on first sign-in
  pace_format: "min_per_mi" | "min_per_km",
  power_units: "watts"
}
```

Timezone is required for date-bucketing in workout matching and "today" semantics. Captured via `Intl.DateTimeFormat().resolvedOptions().timeZone` on the client at first sign-in and persisted; user can change via a settings sheet.


### `plans`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk users | |
| `title` | text | e.g., "Boston Marathon Build" |
| `sport` | enum | `run` \| `bike` |
| `mode` | enum | `goal` \| `indefinite` |
| `goal` | jsonb | `{race_date, race_distance, target_time, ...}` — null if indefinite |
| `start_date` | date | |
| `end_date` | date null | null for indefinite |
| `is_active` | bool | partial unique index on `(user_id) where is_active` enforces one active per user |
| `source` | enum | `uploaded` \| `coach_generated` |
| `source_file_id` | uuid null | fk to `plan_files` if uploaded |
| `created_at`, `updated_at` | timestamptz | |

### `workouts`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `plan_id` | uuid fk plans (cascade) | |
| `date` | date | |
| `sport` | enum | `run` \| `bike` — defaults to plan sport, overridable |
| `type` | enum | `easy` \| `long` \| `tempo` \| `threshold` \| `intervals` \| `recovery` \| `race` \| `rest` \| `cross` |
| `distance_meters` | numeric null | canonical SI; UI converts per user pref |
| `duration_seconds` | int null | |
| `target_intensity` | jsonb null | `{pace?, power?, hr?, rpe?}` — see schema below |
| `intervals` | jsonb null | array of `{reps, distance_m?, duration_s?, target_intensity, rest}` |
| `notes` | text | |

**`target_intensity` shape:**

```ts
{
  pace?: { min_seconds_per_km?: number, max_seconds_per_km?: number },
  power?: { min_watts?: number, max_watts?: number },
  hr?:    { min_bpm?: number, max_bpm?: number } | { zone: string },
  rpe?:   number  // 1-10
}
```

All fields optional; coach picks the right one(s) per workout. Running typically uses pace+HR; cycling typically uses power+HR.

**Workout type → sport mapping:**

| type | running | cycling |
|---|---|---|
| `easy` | easy run | endurance / Z2 |
| `long` | long run | long endurance |
| `tempo` | tempo (~20-30min sustained) | tempo (Coggan Z3) |
| `threshold` | LT pace, ~1hr race effort | FTP intervals (Coggan Z4) |
| `intervals` | shorter VO2/track intervals | VO2 intervals |
| `recovery` | recovery jog/shake-out | recovery spin |
| `race` | race | race |
| `rest` | rest | rest |
| `cross` | cross-training (anything not run/bike) | cross-training |

### `activities`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk users | |
| `strava_id` | bigint unique | Strava's activity id |
| `start_date` | timestamptz | |
| `name`, `type` | text | Strava-reported (`Run`, `Ride`, `VirtualRide`, etc.) |
| `distance_meters`, `moving_time_seconds`, `elapsed_time_seconds` | numeric/int | |
| `avg_hr`, `max_hr` | numeric null | |
| `avg_pace_seconds_per_km`, `avg_power_watts` | numeric null | |
| `elevation_gain_m` | numeric null | |
| `raw` | jsonb | full Strava response for future analysis |
| `matched_workout_id` | uuid null fk workouts | best-effort match |
| `created_at`, `updated_at` | timestamptz | |

### `activity_laps`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `activity_id` | uuid fk activities (cascade) | |
| `lap_index` | smallint | 1-based |
| `distance_meters` | numeric | |
| `moving_time_seconds`, `elapsed_time_seconds` | int | |
| `avg_pace_seconds_per_km`, `avg_power_watts`, `avg_hr`, `max_hr` | numeric null | |
| `elevation_gain_m` | numeric null | |
| `start_index`, `end_index` | int null | offsets into Strava's stream — useful if streams ever added later |

### `conversations`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk users | |
| `title` | text | auto-generated from first user message |
| `created_at`, `updated_at` | timestamptz | |

### `messages`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `conversation_id` | uuid fk conversations (cascade) | |
| `role` | enum | `user` \| `assistant` |
| `content` | jsonb | full Anthropic content-block array — preserves `text`, `tool_use`, `tool_result`, `thinking` |
| `created_at` | timestamptz | |

We persist the full Anthropic `content` array (not just text) because tool calls and thinking blocks must be round-tripped exactly on the next request, per the Anthropic SDK's content-handling model.

### `plan_files`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk users | |
| `blob_url` | text | Vercel Blob URL (private — accessed only via authed route) |
| `original_filename`, `mime_type` | text | |
| `size_bytes` | int | |
| `status` | enum | `extracting` \| `extracted` \| `failed` |
| `extraction_error` | text null | |
| `extracted_plan_id` | uuid null fk plans | |
| `created_at`, `updated_at` | timestamptz | |

### Cross-cutting

- All user-owned tables enforce `user_id` matches the session at the API-route layer (no DB-level RLS — we're not on Supabase).
- All distance stored in meters, time in seconds. UI converts based on per-user unit preference (mi/km).
- No soft delete. Deletes are real. To preserve a plan, deactivate it (`is_active = false`) — that's what "archive" does.

## 7. Coach loop

The coach is a streaming Claude conversation with tool use, persisted per-user.

### Endpoint shape

```
POST /api/coach/chat
  body: { conversation_id, message }
  response: text/event-stream
    event: text-delta { delta }
    event: tool-use { name, input }
    event: tool-result { name, result_summary }
    event: done { message_id }
```

### Per-request flow

1. Verify NextAuth session; reject if conversation belongs to a different user.
2. Load conversation history from `messages` (full jsonb content blocks preserved).
3. Append the new user message with a small context prefix (date, units, active-plan summary). Context goes after the cached prefix so caching still hits.
4. Persist the user message.
5. Run `client.beta.messages.toolRunner({ stream: true, ... })` — handles the loop, streaming text deltas and executing tool calls.
6. Forward deltas as SSE events to the client.
7. On finish, persist the full assistant content (including `tool_use` blocks) to `messages`.
8. End the stream.

### Model parameters

- `model: claude-opus-4-7`
- `thinking: { type: "adaptive" }`
- `output_config: { effort: "high" }` (intelligence-sensitive — coaching quality matters more than tokens; can dial down to `medium` later if cost requires)
- Stream all responses (large `max_tokens` ceilings + tool loops would otherwise risk SDK timeouts)

### Caching strategy

- `cache_control` breakpoint at the end of the system prompt — caches `tools` + `system` together (tools render before system).
- System prompt is **frozen** — no `Date.now()`, no per-user content, no random IDs.
- Per-user context goes in the user message (after the cache breakpoint), not the system prompt.
- Verify cache hits via `usage.cache_read_input_tokens`.

### Tool surface

All tools enforce `user_id` from the session — Claude can only see/modify the current user's data.

| Tool | Purpose |
|---|---|
| `get_active_plan` | Returns active plan + all workouts as structured JSON |
| `list_plans` | Returns all plans (active + archived) for the user |
| `get_plan(plan_id)` | Specific plan + workouts |
| `create_plan({title, sport, mode, goal?, start_date, end_date?, workouts[], set_active})` | Create a new plan |
| `update_workouts({plan_id, operations})` | Atomic batch upsert/delete by date |
| `set_active_plan(plan_id)` | Set a plan as active (deactivates others) |
| `archive_plan(plan_id)` | Mark inactive without deleting |
| `get_recent_activities({days})` | Strava activities + summary stats |
| `get_activity_laps(activity_id)` | Lap-by-lap breakdown |
| `update_activity_match({activity_id, workout_id})` | Re-match an activity to a different workout |
| `get_athlete_summary` | Strava profile + training-volume rollup (4/12/52 weeks) |
| `read_uploaded_file({plan_file_id})` | Returns the contents of a previously uploaded plan file (PDF passed as document block, CSV/Excel as parsed rows, text as text). Used when extraction failed or user wants the coach to interactively build a plan from a file. |

Plus the server-side `web_search` tool (`web_search_20260209`) for product / gear / race research. Citations come back automatically.

### System prompt covers

- Role: experienced running and cycling coach for advanced athletes.
- Available data: structured plan schema (so Claude can correctly fill `create_plan` / `update_workouts`), Strava activity + lap shape.
- Behavior: ask before making large plan changes, acknowledge the user's stated goals, explain the *why* of training decisions, distinguish run vs bike coaching principles where relevant.
- Safety: defer to medical professionals on injury / illness questions; do not prescribe medication or specific medical interventions.

## 8. Upload + LLM extraction pipeline

User uploads a PDF / CSV / Excel / Markdown training plan → we convert to the structured schema using Claude.

1. **Client → POST `/api/plans/upload`** with file (multipart, max ~10MB).
2. **Server validates** mime + size, creates a `plan_files` row with `status = 'extracting'`, uploads to Vercel Blob, returns the file id immediately so UI can show progress.
3. **Extraction** runs server-side after the response (Vercel `after()` hook or queued task):
   - **PDF** → upload to Anthropic Files API, reference as a `document` block. Claude reads the PDF natively (no client-side OCR).
   - **CSV / Excel** → parse to JSON rows server-side (`papaparse` for CSV, `xlsx` for Excel), pass as text content.
   - **Markdown / plain text** → pass directly.
4. **Extraction prompt** uses **structured outputs** (`output_config.format` with a JSON schema matching the plan + workouts shape). `client.messages.parse()` with a Zod schema gives a typed result.
5. **On success:** insert `plans` + `workouts` rows in a transaction; set `plan_files.status = 'extracted'`, link `extracted_plan_id`.
6. **On failure:** set `status = 'failed'` + `extraction_error`. UI surfaces the error and offers a fallback: "ask the coach to help build this from your file" — coach can read the file via a tool call and build the plan interactively.
7. **UI polls** `GET /api/plans/upload/:id` until status changes.

### Failure modes the UI handles

- File isn't a training plan → friendly error.
- Plan dates are ambiguous ("Week 1, Day 1" with no anchor) → mark partial; user picks a start date in a follow-up modal.
- Workouts present but missing pace/HR/etc. → fine, those fields are nullable; coach can fill in via chat.

### Auth

- Always validates `user_id` from session.
- Blob URLs are never public; access goes through `/api/plans/upload/:id/file` which checks ownership.

## 9. Strava integration

Two channels: **OAuth (login)** and **Activity sync (data)**. The coach reads from our database, not Strava — coach latency is bounded by DB reads, not the Strava API.

### OAuth + token lifecycle

- Strava OAuth scopes: `read`, `activity:read_all`.
- NextAuth's Drizzle adapter persists `access_token`, `refresh_token`, `expires_at` to `accounts`.
- **`getStravaToken(userId)` helper** wraps every Strava API call: if `expires_at < now + 60s`, refreshes via `POST /oauth/token` with `grant_type=refresh_token`, updates the row, returns the new token.
- Strava tokens expire after 6 hours — refresh is routine.

### Initial backfill

On first login, pull the last **90 days** of activities:
- Paginate `GET /athlete/activities?per_page=100&after={ts}` with exponential backoff on 429.
- For `Run` and `Ride`/`VirtualRide` activities: fetch detailed activity + laps (`GET /activities/{id}` with `include_all_efforts=true`).
- Insert into `activities` + `activity_laps` in transactions.
- Runs as a background job — UI shows "syncing your last 90 days…" and unlocks the coach when done.

### Ongoing sync — webhooks

- **One-time subscription** (deploy hook or manual): `POST /push_subscriptions` with `callback_url=https://colbystrainingplan.com/api/strava/webhook` and a verify token.
- **Subscription verification:** Strava sends a `GET` with `hub.challenge`; we echo it back with the verify token validated.
- **Event handling** at `POST /api/strava/webhook`:
  - `activity create/update` — fetch full activity + laps, upsert, run workout matching.
  - `activity delete` — remove from our DB.
  - `athlete update` (deauth) — clear tokens, mark account disconnected.
- Return 200 within ~2s; offload heavy work to a queued task. Strava retries up to 3x with backoff on non-200.
- **One active webhook subscription per Strava app** — separate Strava apps for staging and production.

### Workout matching

When a new activity is upserted:
- Find the user's active plan.
- Find a `workouts` row where `plan_id = active_plan` AND `date = activity.start_date::date` (in user's TZ).
- Match if the type aligns: `Run` → run-sport workouts; `Ride`/`VirtualRide` → bike-sport workouts; `cross` matches anything.
- Set `activities.matched_workout_id` if matched. Best-effort. Coach can re-match via `update_activity_match`.

### Manual sync

`POST /api/strava/sync` triggers a 7-day backfill — useful when webhooks are flaky or after a long offline period.

## 10. View specs

### Today (`/today`)

- Header: today's date, weekday, "Week N of M — {plan title}".
- Hero card: today's workout. Type badge (color-coded by type), distance/duration, `target_intensity` rendered (pace zone or power zone or HR zone), interval breakdown if applicable, notes.
- If a Strava activity has been auto-matched: completion badge with actuals (distance, time, avg pace/power/HR, lap summary). Tap to expand laps.
- "Ask coach about today" shortcut → opens coach chat with this workout pre-attached as context.
- Below the fold: tomorrow + day-after, smaller cards.

### Calendar (`/calendar`)

- Default: week view on mobile, month view on desktop.
- Each cell: type badge (color-coded), distance/duration, completion checkmark if Strava-matched.
- Tap a cell → opens that day's workout detail in a sheet.
- Toggle: week / month.
- Month view: weekly mileage / duration totals on the right edge.

### Plans (`/plans`)

- List of all plans, sorted by `created_at desc`.
- Each row: title, sport icon, mode (`goal` w/ race date or `indefinite`), date range, status (active / archived), source (uploaded / coach-generated).
- Active plan has a clear "Active" badge.
- Per-row actions: set active, archive, delete (with confirm), download original file (if uploaded).
- Top of page: two CTAs — **Talk to coach to build a plan** (primary) and **Upload a plan** (secondary).
- Upload flow: drag-and-drop zone, status indicator while extracting, "Review" step before saving (let user fix any extraction errors).

### Coach panel

- Conversation list (collapsible) — past chats, ability to start new.
- Active chat: streaming responses, tool-call indicators ("checking your recent runs…"), markdown rendering.
- Input: text + optional context attachment ("attach today's workout / a date range / a specific activity").
- File upload allowed in chat too — drag a plan file, coach helps build/import.

## 11. v1 phasing

Each phase ends in a working app deployable to a Vercel preview.

| Phase | What lands | Depends on |
|---|---|---|
| **1. Skeleton** | Next.js + Drizzle + Neon + NextAuth(Strava) + base layout + empty pages + auth flow + user preferences capture (units, TZ) | — |
| **2. Strava sync** | Activity backfill, webhook subscription, `activities` + `activity_laps` populated, manual sync endpoint | 1 |
| **3. Plans + manage** | Plan/workout schema, manage page, set-active, archive, delete (no upload yet) | 1 |
| **4. Coach (full)** | Chat endpoint, conversation persistence, full tool surface (read + write) — `get_active_plan`, `get_recent_activities`, `create_plan`, `update_workouts`, `set_active_plan`, etc. — plus `web_search`. Coach can answer questions and build/tweak plans. | 2 + 3 |
| **5. Today + Calendar** | Today view (hero card + Strava match) + Calendar (week/month, type badges, matched indicator). | 2 + 3 |
| **6. Upload pipeline** | File upload → Vercel Blob → LLM extraction → review step → save. Includes `read_uploaded_file` tool for coach fallback. | 4 |
| **7. Polish** | Coach panel UX, loading states, error states, mobile QA, perf. | all |

## 12. Security & privacy

- All API routes verify the NextAuth session and scope by `user_id`.
- Strava OAuth tokens stored encrypted at rest (Neon's standard encryption); accessed only server-side via `getStravaToken`.
- Anthropic API key server-side only — never shipped to the browser.
- Vercel Blob URLs accessed only via authed proxy route.
- Webhook receiver validates the subscription id and the verify token.
- No PII beyond what Strava provides (Strava OAuth doesn't return email; we don't collect any email).
- LLM calls do not log message content to any third-party observability tool by default.

## 13. Open questions for follow-up phases

These do not block v1 but should be revisited:

- **Compaction:** when does the median conversation start to need it? Add `betas: ["compact-2026-01-12"]` + `context_management: { edits: [{ type: "compact_20260112" }] }` once needed.
- **Notifications:** race-day reminders, weekly summary email, "you missed yesterday's run" pings — requires capturing an email separately (Strava OAuth doesn't expose it).
- **Manual workout overrides without the coach:** should there ever be a "skip this workout" or "log a substitute" button? Currently *only* the coach edits plans, by design.
- **Plan templates / cloning:** "build me a plan like Sarah's" or coach-curated starting-point templates.
- **Rate-limit defenses:** Anthropic budget caps per user, Strava rate-limit observability.
- **Garmin / Apple Health support:** the data model is sport- and source-agnostic enough to add another import source; the only sticky bit is auth (we made Strava the auth gate).

## 14. Domain & deployment

- Domain: `colbystrainingplan.com` (already chosen).
- Hosting: Vercel.
- Environments: production (`colbystrainingplan.com`), preview (per-PR Vercel preview URLs with branched Neon DBs).
- Strava setup: separate Strava apps for staging vs production (one webhook subscription per app).
