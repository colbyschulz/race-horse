# Build with coach — Design Spec

**Date:** 2026-04-27
**Status:** Draft for review
**Author:** Colby Schulz (with Claude)

## 1. Summary

Today, the "Build with coach" button on `/plans` is a bare link to `/coach?from=/plans` — the user lands on a blank chat and has to figure out what to ask. The coach has Strava tools available but doesn't preemptively load them, and the system prompt's `Act first, explain after` rule actively pushes against the structured intake that cold-start plan building actually needs.

This spec replaces that with a small, structured intake card on the coach page, plus a one-time pre-fetch of Strava history into the model's context, plus a carve-out in the system prompt that allows one focused clarifying question for cold starts only. The new plan is created as inactive and the coach links the user to `/plans` to activate.

## 2. Non-goals

- Not building a multi-step wizard. The form is one card, four-to-six fields, on the coach page.
- Not changing the rolling-chat model. The form's submit becomes a regular user message in the existing rolling chat. No new conversation, no second URL surface.
- Not adding recovery for mid-build errors. If the coach errors mid-build, plan creation rolls back via the existing tool-handler transaction, the user sees the error in the coach's reply, and they re-click "Build with coach" to try again. Edge case.
- Not changing tool surfaces. `create_plan`, `update_workouts`, `get_athlete_summary`, `get_recent_activities` already provide what we need.
- Not adding rendering for "build form" as a custom message content variant. The form is stored as Markdown text; the renderer detects a sentinel comment to swap in a locked-form card on history reload.

## 3. User flow

1. User clicks **Build with coach** on `/plans`. Link is `/coach?intent=build`.
2. Coach page loads. Because `?intent=build` is in the URL, the BuildFormCard renders above the message input. Empty state of the chat (or existing chat history) sits behind it. Input is disabled while the form is active.
3. User fills the form (sport, goal type, race details if applicable, free-text goals & context) and clicks **Build plan**.
4. Form transitions to a locked state showing the submitted values plus a small spinner with text *"Loading your training history…"*. Input remains disabled.
5. Server-side: pre-fetch athlete summary (4/12/52-week rollup) + last 12 weeks of activities summary, then start the coach turn with the form's content as the user message and the pre-fetched Strava data injected into the per-turn `<context>` prefix along with a `Cold-start plan build: true` flag.
6. Coach streams its reply. Spinner on the form card disappears once the first text delta arrives. Per the system-prompt carve-out, the coach either:
   - Asks one focused clarifying question (rare — only when the form + Strava picture is genuinely missing or contradictory), or
   - Calls `create_plan` (with `set_active: false`) and `update_workouts`, then explains what it built and ends the reply with a "View your plans →" link to `/plans`.
7. Once the stream completes, the input re-enables. The form card stays in the scroll area as a locked summary of the build request. URL is rewritten to `/coach` (intent param consumed).
8. User clicks "View your plans →" (or navigates whenever they want) and activates the new plan from `/plans`.

If the user clicks **Cancel** on the form before submitting, the card disappears, the URL is rewritten to `/coach`, and the chat resumes its normal empty/history state.

## 4. UI

### 4.1 BuildFormCard component

Location: rendered inside `CoachPageClient`'s scroll area, above the existing `MessageInput`, gated on the `intent=build` query param.

Three states:

**Editable** (initial):
- **Sport** — radio: Run / Bike. Required.
- **Goal type** — radio: Race-targeted / Indefinite build. Required.
- **Race date** — `<input type="date">`, required if race-targeted, hidden otherwise.
- **Race distance / event** — text input with preset chips below it (5K, 10K, Half, Marathon, Ultra, Custom), required if race-targeted.
- **Target time** — text input, optional. Placeholder: *"sub-3:00"*.
- **Goals & context** — `<textarea>`, optional, ~3 rows. Placeholder: *"Anything else worth knowing — race terrain, days you can't train, equipment, injuries, prior PBs, etc."*
- Buttons: **Build plan** (primary), **Cancel** (text).

**Submitting** (post-submit, pre-first-stream-delta):
- All fields disabled, showing the submitted values.
- Buttons replaced by a row containing a spinner and the text *"Loading your training history…"*.

**Locked** (after first stream delta and on history reload):
- Same as submitting, but spinner is gone. Just shows the submitted values as a static summary card.

Visually distinct from message bubbles — narrower max-width, border-only, no avatar, lower visual weight than coach/user bubbles.

### 4.2 PlanActionRow change

`src/components/plans/PlanActionRow.tsx` — change the link's href from `/coach?from=/plans` to `/coach?intent=build`. Otherwise unchanged.

### 4.3 Coach page client change

`src/app/(app)/coach/CoachPageClient.tsx`:
- Read `intent` from `searchParams` (already wired through `page.tsx`'s `searchParams`).
- If `intent === "build"` and the form has not yet been submitted in this navigation, render the BuildFormCard.
- New form-submit path that hits a new endpoint (`POST /api/coach/build`) — see §5.
- Disable the existing `MessageInput` while the form is active.
- After the stream completes for a build turn, rewrite the URL via `router.replace("/coach")` so the form doesn't reappear if the user refreshes.

## 5. Server

### 5.1 New endpoint: `POST /api/coach/build`

Body:

```ts
{
  sport: "run" | "bike";
  goal_type: "race" | "indefinite";
  race_date?: string;            // YYYY-MM-DD, required if goal_type === "race"
  race_event?: string;           // e.g. "Boston Marathon" or "Half"
  target_time?: string;
  context?: string;              // free-text "Goals & context"
}
```

Validates the session, validates the body (zod), then:

1. **Format the form as Markdown** with a sentinel comment. Example output:
   ```markdown
   <!-- build_form_request -->
   **Build a plan**

   - **Sport:** Run
   - **Goal:** Race — Boston Marathon, 2026-04-20
   - **Target time:** sub-3:00
   - **Goals & context:** Hilly course (3000ft of climbing). Can't run Sundays. Coming back from a calf strain — no fast intervals for the first 3 weeks.
   ```
2. **Persist** as a `messages` row with `role=user` and the markdown above as the sole text content block.
3. **Pre-fetch Strava** server-side (in parallel where possible):
   - `getAthleteSummary(userId)` — 4/12/52-week training-volume rollup. Reuses the same query that backs the existing `get_athlete_summary` tool.
   - `getRecentActivitiesSummary(userId, { days: 84 })` — last 12 weeks of activities, summarized (count, total distance, average pace/power/HR, weekly mileage curve).
   - If either query returns sparse data (e.g., `< 4 weeks` of data), include a `minimal: true` flag in the injected payload.
4. **Run the coach turn** by calling the existing `runCoach()` runner with the new context-prefix injection (see §5.2). Stream SSE back to the client.
5. **On stream `done`**, return as normal. The form's `is_active` plan flag is whatever the coach set via `create_plan` — for a build turn the coach is instructed to pass `set_active: false`.

This endpoint runs the same coach loop as `/api/coach/chat`. The only differences are: (a) it persists the form-as-markdown user message itself rather than receiving free text, (b) it pre-fetches Strava and adds it to the context prefix, (c) it sets the `Cold-start plan build: true` flag in the prefix.

### 5.2 Per-turn context prefix changes

`src/coach/context.ts`'s `renderContextPrefix` gains two optional params:

```ts
{
  ...
  stravaPreload?: {
    athlete_summary: AthleteSummary;
    recent_activities_summary: RecentActivitiesSummary;
    minimal: boolean;
  };
  coldStartBuild?: boolean;
}
```

When `coldStartBuild` is true, render an extra section in the `<context>` block:

```
Cold-start plan build: true
```

When `stravaPreload` is set, render its serialized JSON inside a labeled section:

```
Strava preload (last 12 weeks + 4/12/52 rollups):
<JSON>

Strava history: minimal
```

`renderContextPrefix` is only called for build-turn requests. Subsequent turns from the user (typed messages, even if they continue the build conversation) do *not* re-inject the Strava preload. The model has the Strava data in the message history already (as the result of the previous turn's context prefix); calling tools is the path forward if it needs more.

### 5.3 System prompt revision

In `src/coach/systemPrompt.ts`, replace the `**Act first, explain after.**` paragraph (currently lines 22–24) with:

```
**Act first when you have enough; ask once when you don't.**
For tweaks and incremental changes (a single workout, a week of work, a small adjustment), act first and explain after — don't ask the user to confirm. You're the expert.
For cold-start plan creation (the per-turn context will say `Cold-start plan build: true`), the bar is different: a new plan locks in weeks of training, so a missing fact has compounding cost. If the form + Strava picture is coherent, write the plan. If something is genuinely missing or contradictory (e.g., the target time is far outside what the Strava baseline supports, the race date conflicts with current fitness, or `Strava history: minimal` and you have no baseline to anchor on), ask **one** focused clarifying question first, then write. Never more than one question per cold start.
When you create a cold-start plan, set it as inactive (`set_active: false`) — the user activates from the Plans page. End your reply with a brief summary of what you built and a `[View your plans →](/plans)` link.
```

The system prompt remains frozen across requests (no per-user content) so the cache breakpoint at the end still hits.

### 5.4 Failure handling

The build flow calls `create_plan` then `update_workouts`. They are not wrapped in a single transaction — each tool call is its own DB transaction. If anything errors mid-loop, the runner emits an error SSE event and the user sees the error in the streaming reply. They click "Build with coach" again to retry.

This means: if `create_plan` succeeded but the model errored before `update_workouts` (or `update_workouts` itself failed), an empty (or partially-populated) plan is left orphaned in `plans`. The user can delete it from `/plans`. We accept this — wrapping the whole tool-loop in a single transaction would require restructuring the runner, and the failure mode is rare and recoverable. Per §2, we are explicitly not adding mid-build recovery.

## 6. Persistence shape

User message (form submission):
- Stored in `messages` as `role=user`, `content=[{ type: "text", text: "<markdown with sentinel>" }]`.
- The leading line `<!-- build_form_request -->` is the sentinel. Markdown-comment style means it renders to nothing if anyone ever views it as plain markdown.

Assistant message:
- Standard. The full Anthropic content array (text + tool_use + tool_result blocks) gets persisted as before.

Renderer logic in `MessageBubble` (or wherever messages are rendered):
- Before rendering as a normal user bubble, peek at the first text block. If it begins with `<!-- build_form_request -->`, parse out the form fields from the markdown and render the BuildFormCard's **Locked** state instead.
- Parsing is regex-based against the known markdown shape. If parsing fails (corrupted history), fall back to rendering as a plain markdown bubble.

## 7. Edge cases

- **No active plan, no plans at all:** unaffected — the build flow doesn't depend on either.
- **Active plan exists:** new plan is created with `set_active: false`. No interaction with the existing active plan. Coach is told the active plan situation in the existing context prefix (active-plan summary block) and explicitly instructed in the system prompt not to deactivate it.
- **No / minimal Strava history:** the `Strava history: minimal` flag activates the system prompt's one-question carve-out. Coach asks for a baseline (current weekly volume, recent races) before writing.
- **Coach errors mid-build:** plan rows orphaned if `create_plan` ran but the loop died before `update_workouts`. Acceptable. The streamed reply ends with the error event. User retries by re-clicking "Build with coach."
- **User reloads `/coach?intent=build` after a partial submit:** treated as a fresh build request — form re-renders in editable state. The previous run's persisted user message + (possibly partial) coach reply still sit in the rolling chat history.
- **User clicks "Build with coach" while the form for a previous build is still mid-stream:** front-end discards the in-flight stream and renders a fresh form. No special server logic.

## 8. Testing

- Unit: form validates required fields per goal type; markdown formatter produces expected output for each form combination.
- Unit: `renderContextPrefix` includes the new sections when params are passed; doesn't include them otherwise; existing test cases still pass.
- Integration: `POST /api/coach/build` rejects unauthenticated requests; persists the user message with sentinel; calls `runCoach` with the right context.
- Component: BuildFormCard renders editable / submitting / locked states; sentinel-detection in `MessageBubble` swaps in the locked card on history reload.
- E2E (manual for now): full happy-path build flow on a seeded test user with a known Strava history fixture.

## 9. What I'm not changing

- One rolling chat per user — unchanged.
- "Clear chat" semantics — unchanged.
- `create_plan` / `update_workouts` / `get_athlete_summary` / `get_recent_activities` tool definitions — unchanged.
- Bottom tab bar / global navigation — unchanged.
- Existing `/api/coach/chat` endpoint — unchanged. The build endpoint is parallel.

## 10. Open questions

- The `<!-- build_form_request -->` sentinel is fine as long as no one else writes a leading HTML comment in user content. We don't currently. If that ever changes, switch to a more namespaced sentinel like `<!-- racehorse:build_form_request -->`.
- The Markdown serialization format for the form is part of the contract between the front-end (renderer parsing) and the back-end (formatter). Both should import from a shared module to avoid drift. Suggested: `src/coach/buildForm.ts` exporting `formatBuildForm()` and `parseBuildForm()`.
