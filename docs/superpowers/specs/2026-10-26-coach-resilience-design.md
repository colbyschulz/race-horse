# Coach chat resilience — Design Spec

**Date:** 2026-10-26
**Status:** Draft for review
**Author:** Colby Schulz (with Claude)

## 1. Summary

Coach chat is architected as a single HTTP request per turn: the client opens a
streaming `fetch` to `/api/coach/chat` (or `/api/coach/build`), the server runs an
agentic loop (`runCoach` in `src/server/coach/runner.ts`) and pushes SSE events
directly from that loop into the HTTP response, and the assistant's reply is only
written to the `message` table once the loop finishes inside that one request.
Nothing outside the request tracks that a turn is in progress.

This breaks in two independent ways, both reported by the user:

1. **Disconnection loses the turn.** These are actually two sub-cases with
   different mechanics:
   - **In-app navigation** (clicking to another screen) unmounts
     `CoachPageClient`, but nothing aborts the in-flight `fetch`/stream reader —
     it's the same document, so the browser keeps the connection open and
     `runCoach` keeps running and persisting server-side. The turn isn't
     actually lost; the problem is purely client-side: the unmounted
     component's `setState` calls are no-ops, so there's no visible indicator,
     and the fresh `CoachPageClient` that mounts when the user comes back has
     no way to know a turn is still (or was) running, so it just shows
     whatever history happened to be in the DB at mount time.
   - **A real disconnect** — closing the tab/app, a hard reload, or the OS
     tearing down a backgrounded PWA — actually closes the underlying
     connection. In `src/lib/sse.ts`, `sseResponse`'s
     `for await (const event of gen)` loop throws when it tries to
     `controller.enqueue` on a now-dead stream. Because this throw happens
     while iterating the `runCoach` async generator, JS calls the generator's
     `.return()`, which runs its `finally` block but skips the rest of its
     body — abandoning the in-flight Anthropic call and any `appendMessage`
     calls still ahead of it. The reply is genuinely never saved here.

   Either way, reopening the coach screen shows no indication anything was (or
   still is) in flight — at best stale history, at worst a permanently missing
   reply.

2. **Large ad hoc requests hit a hard platform ceiling.** Neither
   `/api/coach/chat/route.ts` nor `/api/coach/build/route.ts` sets
   `maxDuration`, unlike `/api/plans/upload/[id]/extract/route.ts`, which already
   follows this convention for its own long-running work. Production logs
   confirm the failure mode directly: `Vercel Runtime Timeout Error: Task timed
   out after 300 seconds`. This is Vercel's Hobby-plan ceiling — adding
   `maxDuration` won't raise it, only make the existing limit explicit. The
   triggering case: asking the coach (from chat, not the Build form) to create
   and populate several weeks of workouts from scratch with no active plan. The
   coach can do this today (`create_plan` + `update_workouts` are available
   outside the Build flow), but doing it all in one turn's agentic loop can
   legitimately run past 300 seconds. When the platform kills the function, the
   client always shows the same hardcoded `"Coach error — please try again."`
   alert, regardless of what actually failed.

Both are made worse by the same gap: there is no durable record that a turn is
"in progress," so neither the server nor the client can tell the difference
between "still working," "finished," and "died without finishing."

## 2. Goals

- A turn that's cut short — by navigation, app close, or the platform timeout —
  never silently vanishes. Whatever the coach legitimately produced (including
  tool side effects like a created plan) is reflected in the conversation and
  in the rest of the app (plan list, etc.) once the user is back.
- Returning to the coach screen (switching screens and back, or a fresh app
  open) notices a still-in-progress turn and shows the finished reply once it
  lands, without the user having to do anything. Confirmed with the user:
  re-streaming tokens live on reconnect is **not** required — it's fine for the
  finished reply to just pop in.
- Large ad hoc requests are far less likely to ever hit the platform ceiling.
- When a request genuinely is cut off, the user sees an accurate, specific
  message instead of the current generic one.

## 3. Non-goals / anti-goals

- Not building a live SSE reconnect/resume-streaming protocol. Polling for
  completion after the fact is sufficient (user-confirmed).
- Not moving coach generation off Vercel Functions onto separate durable job
  infrastructure (queues, workers, etc.). Out of proportion for a personal
  project; this design works within Hobby-plan constraints.
- Not enabling Next.js Cache Components / `<Activity>`-based cross-navigation
  state preservation. It's a large, app-wide structural change, and the
  poll-for-completion approach below already covers both the in-app-navigation
  case and the app-closed case uniformly, making it unnecessary for this
  problem specifically.
- Not guaranteeing arbitrarily large single-turn requests ("build a full year
  of workouts in one message") will succeed. We reduce how often the ceiling is
  hit and fail gracefully when it still is, not eliminate the ceiling.
- Not rendering a special "the coach got cut off partway through building your
  plan, here's what it has so far" summary. Out of scope for this pass — a cut
  turn just produces no assistant text in history today (persisted
  `tool_use`/`tool_result`-only messages already render as nothing, via
  `MessageBubble`'s empty-text guard), and that stays true. The fix here is
  making sure the next turn reconnects and completes cleanly, and that any
  plan/workout data the coach already wrote is visible elsewhere in the app via
  the normal cache invalidation.

## 4. Design

### 4.1 Platform timeout: make the ceiling explicit, and avoid hitting it

- Add `export const maxDuration = 300;` to `/api/coach/chat/route.ts` and
  `/api/coach/build/route.ts`, matching the existing convention in
  `/api/plans/upload/[id]/extract/route.ts`. On the current Hobby plan this is
  already the effective ceiling (confirmed by the timeout log), so this is
  about making the limit explicit and future-proofing for a plan upgrade, not
  raising it today.
- Add guidance to `COACH_SYSTEM_PROMPT` (`src/server/coach/system-prompt.ts`):
  when a request would require creating or substantially rewriting more than
  roughly two weeks of workouts in one turn, the coach should do it in batches
  across multiple conversational turns (e.g. finish week 1–2, say what it did
  and that it's continuing, and proceed on the next user turn or a natural
  continuation) rather than attempting everything inside a single turn. This is
  the primary mitigation, since it's the only one of these changes that
  actually reduces how long a single request can run — independent of
  whatever the platform's ceiling happens to be.
- Replace the client's hardcoded alert in `CoachPageClient`'s `send` and
  `buildSubmit` catch blocks. Keep showing the specific message when the server
  already sent one via an `error` SSE event (e.g. the existing "Response was
  too long to complete" / "declined to answer" cases). Add a distinct message
  for the case where the stream just dies mid-read with no `error` event (the
  signature of a platform-level kill): something like "That request took too
  long and didn't finish — try asking for a smaller piece at a time." The raw
  error continues to go to `console.error` either way.

### 4.2 Durable turn status

Add a small table so "is a turn in progress right now" is something the server
can answer without depending on any particular HTTP connection being alive.

```ts
export const coachTurnStatusEnum = pgEnum("coach_turn_status", [
  "running",
  "done",
  "error",
]);

export const coachTurns = pgTable(
  "coach_turn",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    plan_id: uuid("plan_id").references(() => plans.id, { onDelete: "cascade" }),
    status: coachTurnStatusEnum("status").notNull().default("running"),
    error_message: text("error_message"),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Plain uniqueIndex on (user_id, plan_id) wouldn't dedupe NULL plan_id rows —
    // Postgres treats NULLs as distinct in unique indexes. Split into two partial
    // indexes instead, same pattern as `plan_one_active_per_user_idx` above.
    uniqueIndex("coach_turn_user_plan_idx")
      .on(t.user_id, t.plan_id)
      .where(sql`${t.plan_id} is not null`),
    uniqueIndex("coach_turn_user_null_plan_idx")
      .on(t.user_id)
      .where(sql`${t.plan_id} is null`),
  ]
);
```

One row per `(user_id, plan_id)` conversation (plan_id nullable, same scoping
`messages` already uses), upserted rather than appended — we only need to know
about the most recent turn, not a history of them.

`runCoach` (or a thin wrapper in the route handlers, since `runCoach` is a
generator and the upsert needs to happen before iteration starts and after it
ends/throws) is responsible for:

- Upserting `status: "running"` at the start of a turn.
- Upserting `status: "done"` once the generator yields its `done` event.
- Upserting `status: "error"` with `error_message` set if the generator throws
  or yields an `error` event.

New endpoint `GET /api/coach/turn-status?plan_id=...` (mirrors
`/api/coach/messages`'s auth/scoping) returning the row for the current
user+plan, or `null` if none exists.

**Staleness:** a hard platform kill terminates the process — no `finally`
block runs, so a row can be left stuck on `"running"` forever. The client
treats a `running` row older than ~6 minutes (comfortably past the 300s
ceiling) as failed, the same as an explicit `"error"` status, rather than
polling indefinitely.

### 4.3 Don't let a dead connection kill the generation

`src/lib/sse.ts`'s `sseResponse` currently couples "is anyone reading the SSE
stream" to "does the generation keep running." Decouple them:

```ts
export function sseResponse(gen: AsyncIterable<SSEEvent>): Response {
  const enc = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let clientGone = false;

  const drained = (async () => {
    try {
      for await (const event of gen) {
        if (clientGone) continue;
        try {
          controller!.enqueue(enc.encode(sseEvent(event)));
        } catch {
          clientGone = true;
        }
      }
    } catch (err) {
      if (!clientGone) {
        const msg = err instanceof Error ? err.message : "unknown error";
        try {
          controller!.enqueue(enc.encode(sseEvent({ type: "error", error: msg })));
        } catch {
          clientGone = true;
        }
      }
    } finally {
      if (!clientGone) {
        try {
          controller!.close();
        } catch {
          /* already closed */
        }
      }
    }
  })();

  // Tell the platform to keep this invocation alive (up to maxDuration) until
  // generation + persistence finish, even if the client disconnects early.
  after(() => drained);

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      clientGone = true;
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
```

Key points:

- `drained` owns the single pass over `gen`. It keeps pulling events — and
  therefore keeps `runCoach` executing, including every `appendMessage` call —
  regardless of whether enqueueing to the client succeeds.
- The `cancel()` callback on the underlying source is the explicit, documented
  signal that the consumer went away (rather than relying on `enqueue` happening
  to throw), so `clientGone` flips immediately on disconnect.
- `after(() => drained)` (`next/server`) is what actually keeps the server
  function running past the point where the HTTP response would otherwise be
  considered finished — this is exactly what `after`/`waitUntil` are for. It's
  still bounded by the route's `maxDuration`, same as today; this doesn't grant
  unlimited runtime, it just stops a disconnect from being the thing that cuts
  generation short before the platform's own limit would.
- `appendMessage` calls inside `runCoach` already happen incrementally (after
  each model call and each tool round-trip), so most of a long turn's progress
  is durable well before the final `done` event — this change mainly protects
  the in-flight model call and the final persisted assistant message.

**Known risk, unverified:** this mechanism's value depends on `after()`
(`waitUntil` under the hood) actually extending the Hobby-plan function's
lifetime up to `maxDuration` after the client disconnects, rather than only a
short grace window — the Next.js docs describe the mechanism but not its
exact duration guarantees per Vercel plan tier, and nothing in this repo
confirms it. This can't be verified by reading code; it needs a real-world
check after deploying (start a build, close the tab, come back in a minute or
two, confirm it finished). If the grace window turns out to be short, this
piece degrades gracefully rather than regressing: in-app navigation already
doesn't need it (per §1), most ordinary (non-build) turns finish in seconds
regardless, and a turn that still doesn't make it now surfaces as an accurate
`"error"`/stale status instead of silently vanishing — worse case is "no
better than before" for the tail of very long builds cut off by a real
disconnect, not "worse than before."

### 4.4 Client: notice and resume an in-progress turn

In `CoachPageClient`:

- On mount, and after the existing `send`/`buildSubmit` flows settle, check
  `GET /api/coach/turn-status`. If `status === "running"` (and not stale), show
  the existing `ThinkingIndicator` (already used for live streaming — no new UI
  needed) and poll the same endpoint every ~2–3s.
- While that poll is active, fold it into the same gate that already disables
  `MessageInput` on `sending` (`coach-page-client.tsx:364-367`). Without this, a
  user who reopens mid-turn could send a second message against the same
  `(user_id, plan_id)` conversation while the first is still running
  server-side, racing message ordering and the single `coach_turns` row against
  each other.
- When polling resolves to `"done"`, call the existing `reloadHistory()` — it
  already refetches messages and invalidates the `plans`/`coach notes` query
  caches, which is exactly what's needed to surface any plan/workout changes
  the coach made.
- When polling resolves to `"error"` or a stale `"running"` row, show the
  specific error message (same display path as §4.1's error handling) instead
  of leaving the thinking indicator spinning forever.
- This logic is identical whether the "in progress" turn was interrupted by
  switching screens and coming back, or by fully closing and reopening the
  app — both are just "mount and the turn-status check says running." No
  separate code path is needed for the two cases, **provided the mount actually
  knows which `plan_id` to check** — see §4.5 for the one case where that isn't
  automatic.

### 4.5 Cold-start build: recovering the plan_id across an interruption

A cold-start build (`?intent=build`, no plan yet) is a gap in the mechanism
above: `CoachPageClient` deliberately defers updating the URL to
`?plan_id=<new>` until *after* the whole turn finishes (`coach-page-client.tsx`
— the comment there explains this avoids `useSearchParams()` remounting the
component mid-stream, which would otherwise interrupt the carefully-sequenced
build UX described in `2026-04-27-build-with-coach-design.md`). That timing is
worth keeping for the uninterrupted case. But it means if the user switches
screens before that point, the URL is still bare `?intent=build`, the
component's in-memory `receivedPlanIdRef` is lost on unmount, and coming back
to that URL renders a brand-new blank build form — there's no `plan_id` for
the §4.4 mount-time check to poll.

Two additions close this without touching the existing URL-timing behavior for
the normal case:

- **Same-session recovery:** the moment `handleSSE` receives `plan-created`
  (where `receivedPlanIdRef.current` is already set today), also write the id
  to `sessionStorage` under a new key (e.g. `coachInProgressBuildPlanId`) —
  this is the same pattern already used for `justBuiltPlanId`. Clear it once
  the URL is updated at the end of a normal build. In `CoachContent`, the
  `intent === "build" && !planId` branch checks this key before rendering a
  blank form; if set, redirect (`router.replace`) to `/coach?plan_id=<id>`
  instead. This covers switching screens and coming back within the same
  browser session.
- **Cross-session recovery:** `sessionStorage` won't survive an actual app
  close on mobile. For that case, `src/components/plans/plan-card.tsx` already
  shows a distinct "Generating…" badge for a plan with
  `generation_status === "generating"` (`statusOf()`/`STATUS_LABEL`), but the
  card's link always points to `/plans/${plan.id}` — which has nothing useful
  to show for a plan with no workouts yet, and no way back into its coach
  conversation. Change the href for that status to
  `/coach?plan_id=${plan.id}&from=/plans&from_label=${plan.title}` instead.
  This gives the user a path back to the in-progress conversation from the
  Plans list even after a full app close, no stashed client state required.

## 5. What's left to the builder

- Exact poll interval (proposed: 2–3s) and staleness threshold (proposed: 6
  minutes) — tune during implementation/testing, not load-bearing design
  decisions.
- Exact wording of the new timeout-specific client error message and the
  system-prompt batching guidance — implementer's judgment, consistent with
  existing tone in `COACH_SYSTEM_PROMPT` and the existing error strings in
  `runner.ts`.
- Migration file naming/number per the existing Drizzle migration sequence in
  `drizzle/`.
- Whether the turn-status upsert lives inline in `runCoach` or in a thin
  wrapper called from the two route handlers — implementer's call, should
  follow whichever keeps `runCoach` itself easiest to reason about.
