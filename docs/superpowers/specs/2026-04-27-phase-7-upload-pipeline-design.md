# Phase 7: Upload Pipeline — Design Spec

**Date:** 2026-04-27
**Status:** Draft for review
**Author:** Colby Schulz (with Claude)
**Implements:** colbystrainingplan §8 (Upload + LLM extraction pipeline) and §10 (Plans page upload UX)

## 1. Summary

Users can upload a training plan as PDF, CSV, Excel, Markdown, or plain text on `/plans`. The server extracts the plan into the structured `plans` + `workouts` schema using Claude with structured outputs. The user reviews and lightly edits the extracted plan (title, sport, mode, goal, start date) before saving. On extraction failure, the user can retry, discard, or hand the file off to the coach via a new `read_uploaded_file` tool.

In-chat file upload (i.e., dragging a plan file into the coach chat) is **not** in scope for this phase.

## 2. Phase scope

**In scope.**
- `plan_files` schema (table + status enum + `extracted_payload` staging column).
- Six new API routes covering upload, extract, status poll, save, discard, file proxy.
- Drag-drop / click-to-pick upload zone wrapping the existing `PlanActionRow` on `/plans`.
- "In-flight uploads" section on `/plans` showing rows in `extracting`, `extracted`, or `failed` state.
- Dedicated review route `/plans/upload/[id]/review` covering all three lifecycle states with one URL.
- Top-level edits in review (title, sport, mode, goal fields, start date), with live-recomputed read-only preview using Phase 6's `PlanStats`, `MileageChart`, `WeekGrid`. Workout-level data is read-only.
- "Save as active plan" toggle, default = `!hasActivePlan`.
- New coach tool `read_uploaded_file({ plan_file_id })`.
- Coach deep-link extension (`?from=/plans&plan_file_id=<uuid>`) that injects file context into the next coach turn.

**Out of scope (deferred).**
- In-chat file upload (drag a file into the coach panel).
- Per-workout editing on review.
- Image / phone-screenshot ingestion.
- Anthropic Files API integration (we use inline base64 documents instead).
- Real queue / retry infra (Vercel Queues, Upstash QStash).
- Coach using `read_uploaded_file` on successfully-extracted plans.
- Stuck-`extracting` sweep job. If the client-side extract trigger never lands (browser closed mid-flight, transient failure), the row stays `extracting` forever and the user discards manually. Accepted papercut for v1.

## 3. Lifecycle

```
[user uploads]                 POST /api/plans/upload         → row.status = extracting (no plan yet)
[client triggers extraction]   POST /api/plans/upload/[id]/extract
   ├─ success                  row.status = extracted, row.extracted_payload = <staged JSON>
   └─ failure                  row.status = failed,    row.extraction_error = <message>
[user clicks Save on review]   POST /api/plans/upload/[id]/save  → creates plans + workouts, sets row.extracted_plan_id
[user clicks Discard]          DELETE /api/plans/upload/[id]    → deletes blob + row
```

The `plans` row is created **only after the user reviews and saves**, not when extraction succeeds. The extracted JSON lives on `plan_files.extracted_payload` between extraction and save. This keeps `/plans` clean of unconfirmed plans and lets the review page edit the extracted JSON without writing through `plans` first.

## 4. Schema

One new migration:

### `plan_file_status` enum

`extracting | extracted | failed`

### `plan_files` table

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk users (cascade) | |
| `blob_url` | text | Vercel Blob URL — never public; accessed only via authed proxy. |
| `original_filename` | text | |
| `mime_type` | text | |
| `size_bytes` | int | |
| `status` | `plan_file_status` | |
| `extraction_error` | text null | truncated to 1 KB. |
| `extracted_payload` | jsonb null | staged Zod-validated extraction result; cleared after save. |
| `extracted_plan_id` | uuid null fk plans | populated after save; nullable (also stays null for failed/discarded files until row is deleted). |
| `created_at`, `updated_at` | timestamptz | |

`extracted_payload` is a **phase-specific extension** to the spec §6 shape, since the staged JSON needs somewhere to live until the user saves.

No changes to existing tables. The `plans.source_file_id` column (already present) is populated as the inverse FK by the save handler.

## 5. Routes

All routes verify `session.user.id` and scope by `user_id` at the API layer.

### `POST /api/plans/upload`

- Body: multipart/form-data with one file field.
- Server validation: extension in `[pdf, csv, xlsx, md, txt]`; size ≤ 10 MB; mime cross-checked against extension.
- Order:
  1. Pre-generate the new row id with `crypto.randomUUID()`.
  2. `put()` to Vercel Blob at `plan-files/<row_id>/<original_filename>` with `access: "private"`. Captures the returned blob URL.
  3. Insert `plan_files` row with the pre-generated id, the captured `blob_url`, and `status='extracting'`.
  4. If the insert fails, `del()` the blob (best-effort) before returning the error.
- Returns `{ id }`.

### `POST /api/plans/upload/[id]/extract`

- `export const maxDuration = 300;` (Vercel Pro caps at 300s; default Hobby caps at 10s — must override).
- Verifies ownership and `status === 'extracting'` (rejects retry on already-terminal rows; the failed-card "Retry" action handles its own state reset).
- Fetches blob bytes, formats per type (see §6), calls `client.messages.parse({ model: "claude-opus-4-7", system, schema: ExtractedPlanSchema, messages })`.
- On success: writes `extracted_payload` and sets `status='extracted'`. If `extracted_payload.is_training_plan === false`: sets `status='failed'` with message `"This file doesn't look like a training plan."`.
- On thrown error or schema parse failure: sets `status='failed'` and writes a truncated error message to `extraction_error`.
- Returns the final row (including the new status).

### `GET /api/plans/upload/[id]`

- Verifies ownership.
- Returns `{ id, status, original_filename, extraction_error?, extracted_payload? }`. The review page polls this endpoint while `status==='extracting'`.

### `POST /api/plans/upload/[id]/save`

- Body: `{ title, sport, mode, goal?, start_date, set_active }`.
- Verifies ownership and `status === 'extracted'` and `extracted_plan_id IS NULL`.
- Materializes workouts: `date = start_date + day_offset days` for each workout in `extracted_payload.workouts`.
- Computes `end_date` as `max(workout.date)` if `mode === 'goal'`, else `null`.
- Sequence (no DB transactions on Neon HTTP per AGENTS.md):
  1. If `set_active`, deactivate any existing active plan via the existing `setActivePlan` mutation pattern.
  2. Insert `plans` row (with `source = 'uploaded'`, `source_file_id = plan_file.id`, `is_active = set_active`).
  3. Insert `workouts` rows in a single batch.
  4. Update `plan_files.extracted_plan_id` to the new plan id.
  5. If step 3 fails after step 2 succeeds: delete the `plans` row and re-throw. (Best-effort rollback.)
- Returns the new plan id; client redirects to `/plans/[id]`.

### `DELETE /api/plans/upload/[id]`

- Verifies ownership.
- Deletes the Vercel Blob object first (best-effort; logs and continues on Blob errors).
- Deletes the `plan_files` row.

### `GET /api/plans/upload/[id]/file`

- Verifies ownership.
- Streams the blob bytes through with the original `mime_type` and `Content-Disposition: attachment; filename=<original_filename>`.
- Used by `read_uploaded_file` (server-side fetch, not browser) and any future "download original" UI.

## 6. Extraction

### File formatting

| Input mime | Format for Claude |
|---|---|
| `application/pdf` | `document` content block, base64-encoded. Plus a small `text` block: `"Filename: <original_filename>"`. |
| `text/csv` | `papaparse` to objects; serialize as compact JSON in a single text block. |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (xlsx) | `xlsx.read` → `sheet_to_json` per sheet; serialize as `{ sheet: <name>, rows: [...] }` per sheet in a single text block. |
| `text/markdown`, `text/plain` | text block as-is. |

### Extraction system prompt

Frozen (no per-user / per-request content). Cache breakpoint at end. Body covers:

- Role: structured-output extractor for training plans.
- Schema: described in plain English (the actual schema is enforced by `messages.parse`).
- Workout type vocabulary (matches `workoutTypeEnum`).
- Target intensity vocabulary (pace / power / hr / rpe shapes).
- **Date convention**: express each workout as `day_offset` (0-indexed integer) from the plan's start. If the file uses absolute dates, calculate offsets from the earliest workout. If the file uses "Week N, Day M" notation, `day_offset = (N-1)*7 + (M-1)`.
- `tentative_start_date`: populate if the file gives an explicit start (or earliest absolute workout date); otherwise null.
- Safety guard: if the file isn't a training plan, set `is_training_plan: false` and leave the rest as empty defaults.

### Extraction Zod schema (sketch)

```ts
const ExtractedPlanSchema = z.object({
  is_training_plan: z.boolean(),
  title: z.string(),
  sport: z.enum(["run", "bike"]),
  mode: z.enum(["goal", "indefinite"]),
  goal: z.object({
    race_date: z.string().nullable(),       // YYYY-MM-DD or null
    race_distance: z.string().nullable(),
    target_time: z.string().nullable(),
  }).nullable(),
  tentative_start_date: z.string().nullable(),
  workouts: z.array(z.object({
    day_offset: z.number().int().nonnegative(),
    sport: z.enum(["run", "bike"]),
    type: workoutTypeEnumZ,
    distance_meters: z.number().nullable(),
    duration_seconds: z.number().int().nullable(),
    target_intensity: TargetIntensitySchema.nullable(),
    intervals: z.array(IntervalSpecSchema).nullable(),
    notes: z.string(),
  })),
});
```

Workouts are extracted as `day_offset` rather than absolute dates so the review-page start-date picker can shift the entire plan without re-extraction. The save handler materializes absolute dates from `start_date + day_offset`.

### Error handling

- `is_training_plan === false` → `failed` with `"This file doesn't look like a training plan."`.
- Schema validation failure (Anthropic returned malformed structured output) → `failed` with `"Couldn't parse the file's structure."`.
- Anthropic API error / timeout / network → `failed` with the truncated error message.
- File read error from Blob → `failed` with `"Couldn't read the uploaded file."`.

All `extraction_error` strings are truncated to 1 KB before insert.

## 7. UI

### `/plans` changes

**`PlanActionRow.tsx` rewire.** The "↑ Upload plan" button is currently disabled (`title="Coming in Phase 6"`). Wire it to a hidden file input + click handler. Also drop the disabled stub on the "Build with coach" button — that's been live since Phase 4 (small piece of out-of-scope cleanup; free to do alongside).

**New `<UploadDropzone />`.** Wraps `PlanActionRow` so the visible row stays the same.

- Hidden `<input type="file" accept=".pdf,.csv,.xlsx,.md,.txt">` triggered by the Upload button click.
- Drop-target on the wrapper element with visual highlight on `dragover` (border or background tint).
- Client-side validation: extension list and size ≤ 10 MB. On rejection, render an inline error below the row.
- On accepted file: `POST /api/plans/upload`, then `fetch('/api/plans/upload/[id]/extract', { method: 'POST' })` (no `await` on the response — fire and proceed), then `router.push('/plans/upload/<id>/review')`.

**New section: in-flight uploads.** Sits at the top of `/plans` (above the active-plan card, since it warrants attention). Server fetch reads `plan_files where user_id = session.user.id AND extracted_plan_id IS NULL`. Each row renders an `<InFlightUploadCard />`:

- `extracting` → spinner, filename, "Extracting your plan…", **Cancel** button (calls `DELETE`).
- `extracted` → "Ready to review →" linking to `/plans/upload/[id]/review`.
- `failed` → error message, **Retry** (resets `status='extracting'`, re-fires extract route), **Talk to coach** (navigates to `/coach?from=/plans&plan_file_id=<id>`), **Discard**.

### `/plans/upload/[id]/review`

Server component fetches the `plan_files` row (404 if not owned), passes to `<ReviewClient />`. `<ReviewClient />` switches on `status`:

- `extracting` → polling spinner. Calls `GET /api/plans/upload/[id]` every 2 s; replaces local state on response. Stops polling on terminal status.
- `failed` → reuses the failed treatment from `<InFlightUploadCard />` (Retry / Talk to coach / Discard), full-bleed.
- `extracted` → review form.

**Review form layout.**

- Header: "Review extracted plan", filename, small "Discard" link top-right.
- **Editable card** (single column):
  - Title (text input).
  - Sport (radio: run / bike).
  - Mode (radio: goal / indefinite).
  - If mode = goal: race date (date input), race distance (text), target time (text). All optional.
  - **Start date** (date input). Default = `extracted_payload.tentative_start_date ?? today`. Helper text: "All workouts will be re-anchored from this date."
- **Read-only preview** (recomputed live as `start_date` changes):
  - `<PlanStats />` (existing, Phase 6).
  - `<MileageChart />` (existing, Phase 6).
  - Stacked `<WeekGrid />` (existing, Phase 6).
  - All three accept the materialized workouts (computed client-side as `start_date + day_offset`).
- **Footer**:
  - "Save as active plan" toggle. Default = `!hasActivePlan` (server passes `hasActivePlan` boolean to client).
  - **Save** (primary) → POSTs to save route; redirects to `/plans/[id]`.
  - **Discard** (secondary, with `confirm()` dialog) → DELETEs; redirects to `/plans`.

No new visual primitives. The review page composes Phase 6 building blocks plus a standard form.

## 8. Coach integration

### New tool: `read_uploaded_file`

```ts
{
  name: "read_uploaded_file",
  description: "Read a previously uploaded training plan file. Use when the user wants help building a plan from a file that failed automatic extraction.",
  input_schema: {
    type: "object",
    properties: { plan_file_id: { type: "string" } },
    required: ["plan_file_id"],
  },
}
```

**Handler.** Verifies ownership. Fetches blob bytes via the proxy logic (shared util — same code path as `GET /api/plans/upload/[id]/file`, but called server-side, not via HTTP). Dispatches per mime:

| mime | tool_result content |
|---|---|
| PDF | array: `[{ type: "document", source: { type: "base64", media_type: "application/pdf", data: <b64> } }, { type: "text", text: "Filename: <name>" }]` |
| CSV | text block with first ~500 rows as compact JSON, plus truncation count if applicable |
| XLSX | text block with `{ sheet, rows }` per sheet, same truncation |
| MD / TXT | text block with raw contents |

Anthropic SDK supports content-block arrays in `tool_result`, so PDFs ride in the conversation history exactly once (as part of the tool_result block). The existing `messages` table already persists full content arrays, so no schema change is needed.

Add `case "read_uploaded_file": return "Read uploaded file";` to `summarizeToolResult` in `src/coach/tools/index.ts`.

### Per-turn context injection

In `src/coach/context.ts`, extend the per-request context block (which already runs *after* the cache breakpoint, per spec §7) to read a new query param.

When the deep-link is `/coach?from=/plans&plan_file_id=<uuid>`:

1. Verify the file row exists and `user_id` matches the session. If not, drop the param silently (log a warning).
2. Append to the context block:

   ```
   The user wants help with an unprocessed plan file.
   File id: <uuid>
   Filename: <original_filename>
   Status: failed (extraction error: <truncated to 256 chars>)
   Call `read_uploaded_file({ plan_file_id })` to read it and help build a plan.
   ```

3. `routeLabel(from)` continues to return `"Plans / manage page"` — `plan_file_id` is a separate concern.

### System-prompt update

Add one line under the "Available data" section of the existing system prompt:

> "You can read previously uploaded plan files via `read_uploaded_file` when extraction failed and the user wants you to help build the plan from the file."

This sits inside the cached prefix; no caching impact.

### Calling site

The failed `<InFlightUploadCard />` "Talk to coach" button is a `<Link>` to `/coach?from=/plans&plan_file_id=<id>`. No other UI changes to the coach panel.

## 9. Dependencies

- `@vercel/blob` — Vercel Blob SDK (`put`, `del`, signed URL helpers).
- `papaparse` + `@types/papaparse` — CSV parsing.
- `xlsx` (SheetJS) — Excel parsing. Pin to a known-good version.

## 10. Environment

- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token. Set via Vercel project's Blob integration in production and preview environments. Local dev: pull via `vercel env pull` or set manually.
- `ANTHROPIC_API_KEY` — already configured for the coach.

## 11. Testing

### Unit (vitest, mock-only)

- `extraction/format.ts` — given parsed input per file type, produces the expected content-block array. Covers PDF base64 encoding, CSV row count, XLSX multi-sheet, MD/TXT passthrough.
- `extraction/runtime.ts` (the orchestration extracted from the route handler) — given a mocked Anthropic response, transitions a file row to `extracted` with `extracted_payload`, or `failed` with truncated error. Covers `is_training_plan === false`, schema parse failure, and Anthropic API error.
- `plans/materialize.ts` — given `start_date` + extracted workouts (`day_offset`s), produces final `workouts` rows with absolute dates. Covers offset 0, single workout, gap days, end_date computation, indefinite mode (end_date = null).
- `coach/tools/files.ts` (new) — handler enforces ownership (returns error for cross-user `plan_file_id`), dispatches per mime, returns the correct content-block shape. Mock `@vercel/blob`, `papaparse`, `xlsx`.
- `coach/context.ts` — `plan_file_id` query param threads into the per-turn context block when ownership matches; silently dropped when it doesn't.

### Component (testing-library)

- `<UploadDropzone />` — rejects bad mime / oversize, calls `fetch('/api/plans/upload')` on accepted file, redirects to the review URL on success.
- `<InFlightUploadCard />` — renders each of the three status branches with the correct buttons and labels.
- `<ReviewClient />` — given each status branch, renders correctly. Given `extracted`, changing `start_date` updates the WeekGrid preview (assert dates re-anchor). Save button POSTs the right body. Discard prompts confirm before DELETE.

`<MileageChart />`, `<PlanStats />`, `<WeekGrid />` are already covered by Phase 6 tests; no new assertions there.

### Operational smoke (manual checklist in the implementation plan)

- Upload a sample PDF, CSV, XLSX, MD against a dev Neon DB + dev Anthropic key. Verify polling, review, save, plan appears at `/plans/[id]`.
- Force a failed extraction (upload a non-plan PDF) → confirm failed card → "Talk to coach" → coach calls `read_uploaded_file` and continues the conversation.
- Cross-user access: log in as user A, attempt to access another user's `plan_file_id` via the API and the coach context — verify both reject.

## 12. Security

- All API routes verify the NextAuth session and scope by `user_id`.
- Vercel Blob URLs are private; access is always proxied through `/api/plans/upload/[id]/file` with ownership check.
- Coach tool `read_uploaded_file` enforces ownership at the handler level.
- `extraction_error` strings are truncated before insert to bound DB row size.
- Anthropic key remains server-side only.

## 13. Open questions / future work

- **Stuck-`extracting` rows.** If the client-side extract trigger is lost (browser closed mid-upload, transient network), the row stays `extracting` indefinitely. Accepted for v1; the user can manually Discard. A periodic sweep job (Vercel Cron) could promote rows to `failed` after N minutes — defer to Polish.
- **Successful-extraction coach review.** Letting the coach open and discuss a successfully-extracted plan via `read_uploaded_file` is plausible but adds context-bloat in chat. Defer until a real use-case appears.
- **Anthropic Files API.** Switching from inline base64 to Files API would cut request size and let us support larger PDFs, at the cost of tracking another resource lifecycle. Revisit if 10 MB cap or per-call latency becomes a problem.
- **Real queue.** A Vercel/Upstash queue gives true retries and observability. Defer until extraction failures become noisy enough to warrant it.
