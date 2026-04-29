# Build with coach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare "Build with coach" link on `/plans` with a structured intake card on the coach page that pre-fetches Strava history, persists a Markdown-encoded user message, and runs the coach in a "cold-start plan build" mode that allows one focused clarifying question.

**Architecture:** A small structured form (`BuildFormCard`) is rendered above the message input on `/coach?intent=build`. On submit, the form data is formatted as Markdown with a leading sentinel comment (`<!-- build_form_request -->`) and posted to a new `POST /api/coach/build` endpoint. The endpoint pre-fetches the athlete's 4/12/52-week volume rollups and the last 12 weeks of activity summary, then invokes the existing `runCoach` runner with new optional inputs (`stravaPreload`, `coldStartBuild`) that get rendered into the per-turn `<context>` prefix. The system prompt's "Act first, explain after" rule is replaced with a carve-out: act first for tweaks, ask one focused question for cold-start when something is genuinely missing or contradictory. New plans are created with `set_active: false`; the coach reply ends with a "View your plans" link. On history reload, `MessageBubble` detects the sentinel and renders the locked `BuildFormCard` instead of a plain user bubble.

**Tech Stack:** Next.js 15 App Router, TypeScript, React 19, Vitest + Testing Library, Drizzle ORM (Neon Postgres), Anthropic SDK, SCSS Modules.

**Spec:** `docs/superpowers/specs/2026-04-27-build-with-coach-design.md`

**Project conventions** (apply to every task):

- **Commits:** the user drives commits manually. Each task ends at "Verify all tests pass." Do **not** run `git commit` or `git push` from inside a task.
- **Test runner:** Vitest. Run a single file with `npx vitest run <path>`. Run a single test by name with `npx vitest run <path> -t "<test name>"`.
- **TDD:** every task that changes behavior writes the failing test first, runs it to confirm failure, then implements, then runs to confirm pass.
- **No new dependencies** are required for any task in this plan.

---

## File Structure

**New files:**

- `src/coach/buildForm.ts` — `formatBuildForm()` + `parseBuildForm()` + sentinel constant (shared between server formatter and client renderer)
- `src/coach/__tests__/buildForm.test.ts`
- `src/coach/stravaPreload.ts` — `fetchStravaPreload(userId)` returns `{ athlete_summary, recent_activities_summary, minimal }`
- `src/coach/__tests__/stravaPreload.test.ts`
- `src/app/api/coach/build/route.ts` — `POST /api/coach/build` SSE endpoint
- `src/app/api/coach/build/__tests__/route.test.ts`
- `src/components/coach/BuildFormCard.tsx` — three states: Editable / Submitting / Locked
- `src/components/coach/BuildFormCard.module.scss`
- `src/components/coach/__tests__/BuildFormCard.test.tsx`

**Modified files:**

- `src/coach/context.ts` — add `stravaPreload` + `coldStartBuild` params to `renderContextPrefix`
- `src/coach/__tests__/context.test.ts` — add tests for the new sections
- `src/coach/runner.ts` — extend `RunInput` to accept `stravaPreload` + `coldStartBuild`; pass through to `renderContextPrefix`
- `src/coach/__tests__/runner.test.ts` — extend assertions
- `src/coach/systemPrompt.ts` — replace the "Act first, explain after" paragraph
- `src/coach/types.ts` — add `BuildRequestBody` type
- `src/components/coach/MessageBubble.tsx` — detect sentinel on first user message → render locked `BuildFormCard`
- `src/components/coach/__tests__/MessageBubble.test.tsx` — new tests (file may not exist yet — create if missing)
- `src/app/(app)/coach/page.tsx` — pass `intent` from `searchParams` through to `CoachPageClient`
- `src/app/(app)/coach/CoachPageClient.tsx` — accept `intent` prop, render `BuildFormCard` when `intent === "build"`, POST to `/api/coach/build`, disable `MessageInput` while form is open, `router.replace("/coach")` on stream done
- `src/components/plans/PlanActionRow.tsx` — change href from `/coach?from=/plans` to `/coach?intent=build`

---

## Task 1: Build form formatter + parser + sentinel constant

**Files:**

- Create: `src/coach/buildForm.ts`
- Create: `src/coach/__tests__/buildForm.test.ts`

The formatter renders the form as Markdown with a leading HTML comment sentinel. The parser is the inverse — it pulls structured fields back out of the Markdown so the front-end can re-render the locked card on history reload. Both live in one file so they evolve together.

- [ ] **Step 1: Write the failing tests**

Create `src/coach/__tests__/buildForm.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BUILD_FORM_SENTINEL, formatBuildForm, parseBuildForm } from "../buildForm";

describe("BUILD_FORM_SENTINEL", () => {
  it("is the documented HTML comment sentinel", () => {
    expect(BUILD_FORM_SENTINEL).toBe("<!-- build_form_request -->");
  });
});

describe("formatBuildForm", () => {
  it("formats a race-targeted build with all optional fields", () => {
    const md = formatBuildForm({
      sport: "run",
      goal_type: "race",
      race_date: "2026-04-20",
      race_event: "Boston Marathon",
      target_time: "sub-3:00",
      context: "Hilly course. No running Sundays.",
    });
    expect(md.startsWith("<!-- build_form_request -->\n")).toBe(true);
    expect(md).toContain("**Build a plan**");
    expect(md).toContain("- **Sport:** Run");
    expect(md).toContain("- **Goal:** Race — Boston Marathon, 2026-04-20");
    expect(md).toContain("- **Target time:** sub-3:00");
    expect(md).toContain("- **Goals & context:** Hilly course. No running Sundays.");
  });

  it("formats an indefinite build with minimal fields", () => {
    const md = formatBuildForm({
      sport: "bike",
      goal_type: "indefinite",
    });
    expect(md.startsWith("<!-- build_form_request -->\n")).toBe(true);
    expect(md).toContain("- **Sport:** Bike");
    expect(md).toContain("- **Goal:** Indefinite build");
    expect(md).not.toContain("**Target time:**");
    expect(md).not.toContain("**Goals & context:**");
  });

  it("omits target_time and context when empty strings", () => {
    const md = formatBuildForm({
      sport: "run",
      goal_type: "race",
      race_date: "2026-09-01",
      race_event: "10K",
      target_time: "",
      context: "",
    });
    expect(md).not.toContain("**Target time:**");
    expect(md).not.toContain("**Goals & context:**");
  });
});

describe("parseBuildForm", () => {
  it("round-trips a fully populated race build", () => {
    const original = {
      sport: "run" as const,
      goal_type: "race" as const,
      race_date: "2026-04-20",
      race_event: "Boston Marathon",
      target_time: "sub-3:00",
      context: "Hilly course. No running Sundays.",
    };
    const parsed = parseBuildForm(formatBuildForm(original));
    expect(parsed).toEqual(original);
  });

  it("round-trips an indefinite build", () => {
    const original = { sport: "bike" as const, goal_type: "indefinite" as const };
    const parsed = parseBuildForm(formatBuildForm(original));
    expect(parsed).toEqual(original);
  });

  it("returns null when sentinel is missing", () => {
    expect(parseBuildForm("just some text")).toBeNull();
    expect(
      parseBuildForm("**Build a plan**\n- **Sport:** Run\n- **Goal:** Indefinite build")
    ).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(
      parseBuildForm("<!-- build_form_request -->\n**Build a plan**\n- **Sport:** Run\n")
    ).toBeNull();
  });

  it("ignores extra leading whitespace before the sentinel", () => {
    const md = `\n\n${formatBuildForm({ sport: "run", goal_type: "indefinite" })}`;
    const parsed = parseBuildForm(md);
    expect(parsed?.sport).toBe("run");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/coach/__tests__/buildForm.test.ts`
Expected: FAIL — module `../buildForm` does not exist.

- [ ] **Step 3: Implement `src/coach/buildForm.ts`**

```ts
export const BUILD_FORM_SENTINEL = "<!-- build_form_request -->";

export type BuildFormSport = "run" | "bike";
export type BuildFormGoal = "race" | "indefinite";

export type BuildFormInput = {
  sport: BuildFormSport;
  goal_type: BuildFormGoal;
  race_date?: string;
  race_event?: string;
  target_time?: string;
  context?: string;
};

const SPORT_LABEL: Record<BuildFormSport, string> = {
  run: "Run",
  bike: "Bike",
};

export function formatBuildForm(input: BuildFormInput): string {
  const lines: string[] = [BUILD_FORM_SENTINEL, "**Build a plan**", ""];

  lines.push(`- **Sport:** ${SPORT_LABEL[input.sport]}`);

  if (input.goal_type === "race") {
    const event = input.race_event?.trim() ?? "";
    const date = input.race_date?.trim() ?? "";
    const tail = [event, date].filter((s) => s.length > 0).join(", ");
    lines.push(`- **Goal:** Race — ${tail}`);
  } else {
    lines.push(`- **Goal:** Indefinite build`);
  }

  const tt = input.target_time?.trim();
  if (tt) lines.push(`- **Target time:** ${tt}`);

  const ctx = input.context?.trim();
  if (ctx) lines.push(`- **Goals & context:** ${ctx}`);

  return lines.join("\n");
}

const SPORT_FROM_LABEL: Record<string, BuildFormSport> = {
  Run: "run",
  Bike: "bike",
};

export function parseBuildForm(text: string): BuildFormInput | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(BUILD_FORM_SENTINEL)) return null;

  const body = trimmed.slice(BUILD_FORM_SENTINEL.length);

  const sportMatch = body.match(/^- \*\*Sport:\*\* (Run|Bike)$/m);
  const goalMatch = body.match(/^- \*\*Goal:\*\* (Race — (.+)|Indefinite build)$/m);
  if (!sportMatch || !goalMatch) return null;

  const sport = SPORT_FROM_LABEL[sportMatch[1]];
  if (!sport) return null;

  const out: BuildFormInput = {
    sport,
    goal_type: goalMatch[1].startsWith("Race") ? "race" : "indefinite",
  };

  if (out.goal_type === "race") {
    const tail = goalMatch[2] ?? "";
    // tail is "<event>, <date>" or just "<event>" or just "<date>"
    const parts = tail
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const dateIdx = parts.findIndex((p) => /^\d{4}-\d{2}-\d{2}$/.test(p));
    if (dateIdx !== -1) {
      out.race_date = parts[dateIdx];
      const eventParts = parts.filter((_, i) => i !== dateIdx);
      if (eventParts.length > 0) out.race_event = eventParts.join(", ");
    } else if (parts.length > 0) {
      out.race_event = parts.join(", ");
    }
  }

  const ttMatch = body.match(/^- \*\*Target time:\*\* (.+)$/m);
  if (ttMatch) out.target_time = ttMatch[1].trim();

  const ctxMatch = body.match(/^- \*\*Goals & context:\*\* (.+)$/m);
  if (ctxMatch) out.context = ctxMatch[1].trim();

  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/coach/__tests__/buildForm.test.ts`
Expected: PASS, 8 tests passing.

- [ ] **Step 5: Mark task complete**

---

## Task 2: Strava preload helper

**Files:**

- Create: `src/coach/stravaPreload.ts`
- Create: `src/coach/__tests__/stravaPreload.test.ts`

The preload bundles two existing queries (`getAthleteSummary`, `listRecentActivities` reduced to a summary) into a single fetch call for the build flow. It also computes a `minimal` flag — true when the athlete summary's 12-week window is empty or near-empty, signalling to the coach that there's no real baseline to build off of.

- [ ] **Step 1: Write the failing test**

Create `src/coach/__tests__/stravaPreload.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/strava/queries", () => ({
  getAthleteSummary: vi.fn(),
  listRecentActivities: vi.fn(),
}));

import { getAthleteSummary, listRecentActivities } from "@/strava/queries";
import { fetchStravaPreload } from "../stravaPreload";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchStravaPreload", () => {
  it("returns athlete_summary, recent_activities_summary, and minimal=false when 12-week count is healthy", async () => {
    vi.mocked(getAthleteSummary).mockResolvedValue({
      four_week: {
        count: 12,
        total_distance_meters: 100_000,
        total_moving_time_seconds: 30_000,
        by_type: {},
      },
      twelve_week: {
        count: 36,
        total_distance_meters: 300_000,
        total_moving_time_seconds: 90_000,
        by_type: {},
      },
      fifty_two_week: {
        count: 150,
        total_distance_meters: 1_200_000,
        total_moving_time_seconds: 360_000,
        by_type: {},
      },
    });
    vi.mocked(listRecentActivities).mockResolvedValue([
      {
        id: "a1",
        start_date: new Date("2026-04-20"),
        type: "Run",
        distance_meters: 10000,
        moving_time_seconds: 3000,
        avg_hr: 150,
        avg_pace_seconds_per_km: 300,
        avg_power_watts: null,
      },
    ]);

    const out = await fetchStravaPreload("u1");
    expect(out.minimal).toBe(false);
    expect(out.athlete_summary.twelve_week.count).toBe(36);
    expect(out.recent_activities_summary.count).toBe(1);
    expect(out.recent_activities_summary.total_distance_meters).toBe(10000);
    expect(listRecentActivities).toHaveBeenCalledWith("u1", 84);
  });

  it("flags minimal=true when 12-week count is below 4", async () => {
    vi.mocked(getAthleteSummary).mockResolvedValue({
      four_week: {
        count: 1,
        total_distance_meters: 5000,
        total_moving_time_seconds: 1500,
        by_type: {},
      },
      twelve_week: {
        count: 3,
        total_distance_meters: 15000,
        total_moving_time_seconds: 4500,
        by_type: {},
      },
      fifty_two_week: {
        count: 3,
        total_distance_meters: 15000,
        total_moving_time_seconds: 4500,
        by_type: {},
      },
    });
    vi.mocked(listRecentActivities).mockResolvedValue([]);

    const out = await fetchStravaPreload("u1");
    expect(out.minimal).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/coach/__tests__/stravaPreload.test.ts`
Expected: FAIL — module `../stravaPreload` does not exist.

- [ ] **Step 3: Implement `src/coach/stravaPreload.ts`**

```ts
import { getAthleteSummary, listRecentActivities } from "@/strava/queries";

export type StravaPreload = {
  athlete_summary: Awaited<ReturnType<typeof getAthleteSummary>>;
  recent_activities_summary: {
    count: number;
    total_distance_meters: number;
    total_moving_time_seconds: number;
  };
  minimal: boolean;
};

const MINIMAL_THRESHOLD_12W = 4;

export async function fetchStravaPreload(userId: string): Promise<StravaPreload> {
  const [athlete_summary, recentActivities] = await Promise.all([
    getAthleteSummary(userId),
    listRecentActivities(userId, 84),
  ]);

  const recent_activities_summary = {
    count: recentActivities.length,
    total_distance_meters: recentActivities.reduce((acc, r) => acc + (r.distance_meters ?? 0), 0),
    total_moving_time_seconds: recentActivities.reduce(
      (acc, r) => acc + (r.moving_time_seconds ?? 0),
      0
    ),
  };

  const minimal = athlete_summary.twelve_week.count < MINIMAL_THRESHOLD_12W;

  return { athlete_summary, recent_activities_summary, minimal };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/coach/__tests__/stravaPreload.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Mark task complete**

---

## Task 3: Extend `renderContextPrefix` with Strava preload + cold-start flag

**Files:**

- Modify: `src/coach/context.ts`
- Modify: `src/coach/__tests__/context.test.ts`

Add two optional params to `renderContextPrefix`. When `coldStartBuild` is true, render the line `Cold-start plan build: true` inside the `<context>` block. When `stravaPreload` is set, render its serialized JSON in a labeled section, plus a `Strava history: minimal` line if the preload's `minimal` flag is true.

- [ ] **Step 1: Add the failing tests to `src/coach/__tests__/context.test.ts`**

Append at the end of the file:

```ts
describe("renderContextPrefix build branch", () => {
  it("includes Cold-start plan build flag when coldStartBuild is true", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
      coldStartBuild: true,
    });
    expect(out).toContain("Cold-start plan build: true");
  });

  it("omits Cold-start plan build line when flag is absent or false", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
    });
    expect(out).not.toContain("Cold-start plan build");
  });

  it("includes a Strava preload section when stravaPreload is provided", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
      coldStartBuild: true,
      stravaPreload: {
        athlete_summary: {
          four_week: {
            count: 1,
            total_distance_meters: 1,
            total_moving_time_seconds: 1,
            by_type: {},
          },
          twelve_week: {
            count: 5,
            total_distance_meters: 5,
            total_moving_time_seconds: 5,
            by_type: {},
          },
          fifty_two_week: {
            count: 10,
            total_distance_meters: 10,
            total_moving_time_seconds: 10,
            by_type: {},
          },
        },
        recent_activities_summary: {
          count: 5,
          total_distance_meters: 5,
          total_moving_time_seconds: 5,
        },
        minimal: false,
      },
    });
    expect(out).toContain("Strava preload");
    // JSON shape sanity-check (whitespace-tolerant)
    expect(out).toMatch(/"twelve_week"\s*:\s*\{[^}]*"count"\s*:\s*5/);
    expect(out).not.toContain("Strava history: minimal");
  });

  it("flags Strava history: minimal when the preload says so", () => {
    const out = renderContextPrefix({
      today: "2026-04-27",
      units: "mi",
      activePlan: null,
      coachNotes: "",
      fromLabel: null,
      coldStartBuild: true,
      stravaPreload: {
        athlete_summary: {
          four_week: {
            count: 0,
            total_distance_meters: 0,
            total_moving_time_seconds: 0,
            by_type: {},
          },
          twelve_week: {
            count: 0,
            total_distance_meters: 0,
            total_moving_time_seconds: 0,
            by_type: {},
          },
          fifty_two_week: {
            count: 0,
            total_distance_meters: 0,
            total_moving_time_seconds: 0,
            by_type: {},
          },
        },
        recent_activities_summary: {
          count: 0,
          total_distance_meters: 0,
          total_moving_time_seconds: 0,
        },
        minimal: true,
      },
    });
    expect(out).toContain("Strava history: minimal");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/coach/__tests__/context.test.ts`
Expected: FAIL on the four new tests; pre-existing tests still pass.

- [ ] **Step 3: Update `src/coach/context.ts`**

Add the new param types and rendering logic. Replace the entire file with:

```ts
import type { StravaPreload } from "./stravaPreload";

type ActivePlanSummary = {
  title: string;
  weeks_left: number | null;
  workout_count: number;
  completed: number;
};

type PlanFileSummary = {
  id: string;
  original_filename: string;
  status: "extracting" | "extracted" | "failed";
  extraction_error: string | null;
};

const ROUTE_LABELS: Record<string, string> = {
  "/today": "Today view",
  "/training": "Training view (week agenda)",
  "/plans": "Plans / manage page",
  "/settings": "Settings page",
  "/coach": "Coach chat",
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAN_DETAIL_RE = new RegExp(`^/plans/(${UUID})$`);
const WORKOUT_DETAIL_RE = new RegExp(`^/plans/(${UUID})/(\\d{4}-\\d{2}-\\d{2})$`);

export function routeLabel(from: string | undefined | null): string | null {
  if (!from) return null;
  const wmatch = from.match(WORKOUT_DETAIL_RE);
  if (wmatch) {
    return `Workout detail (plan id: ${wmatch[1]}, date: ${wmatch[2]})`;
  }
  const pmatch = from.match(PLAN_DETAIL_RE);
  if (pmatch) {
    return `Plan detail (plan id: ${pmatch[1]})`;
  }
  return ROUTE_LABELS[from] ?? null;
}

export function renderContextPrefix(params: {
  today: string;
  units: "mi" | "km";
  activePlan: ActivePlanSummary | null;
  coachNotes: string;
  fromLabel: string | null;
  planFile?: PlanFileSummary | null;
  stravaPreload?: StravaPreload | null;
  coldStartBuild?: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`<context>`);
  lines.push(`Today: ${params.today}`);
  lines.push(`User units: ${params.units}`);
  if (params.activePlan) {
    const a = params.activePlan;
    const wks = a.weeks_left == null ? "indefinite" : `${a.weeks_left} weeks left`;
    lines.push(
      `Active plan: ${a.title} — ${wks}, ${a.completed} / ${a.workout_count} workouts done`
    );
  }
  if (params.coachNotes.trim()) {
    lines.push(``);
    lines.push(`Coach notes:`);
    lines.push(params.coachNotes.trim());
  }
  if (params.fromLabel) {
    lines.push(``);
    lines.push(`User opened coach from: ${params.fromLabel}`);
  }
  if (params.planFile) {
    lines.push(``);
    lines.push(`The user wants help with an unprocessed plan file.`);
    lines.push(`File id: ${params.planFile.id}`);
    lines.push(`Filename: ${params.planFile.original_filename}`);
    lines.push(
      `Status: ${params.planFile.status}${params.planFile.extraction_error ? ` (error: ${params.planFile.extraction_error.slice(0, 256)})` : ""}`
    );
    lines.push(`Call \`read_uploaded_file({ plan_file_id })\` to read it and help build a plan.`);
  }
  if (params.coldStartBuild) {
    lines.push(``);
    lines.push(`Cold-start plan build: true`);
  }
  if (params.stravaPreload) {
    lines.push(``);
    lines.push(`Strava preload (last 12 weeks + 4/12/52 rollups):`);
    lines.push(
      JSON.stringify(
        {
          athlete_summary: params.stravaPreload.athlete_summary,
          recent_activities_summary: params.stravaPreload.recent_activities_summary,
        },
        null,
        2
      )
    );
    if (params.stravaPreload.minimal) {
      lines.push(``);
      lines.push(`Strava history: minimal`);
    }
  }
  lines.push(`</context>`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/coach/__tests__/context.test.ts`
Expected: PASS — all original + 4 new tests pass.

- [ ] **Step 5: Mark task complete**

---

## Task 4: System prompt revision

**Files:**

- Modify: `src/coach/systemPrompt.ts`

Replace the `**Act first, explain after.**` paragraph with the new "act first when you have enough; ask once when you don't" carve-out. The system prompt remains frozen across requests — caching is preserved.

- [ ] **Step 1: Edit `src/coach/systemPrompt.ts`**

Find the block beginning `**Act first, explain after.**` (around line 24) and replace it with the multi-paragraph block below. The exact diff:

Old (one paragraph):

```
**Act first, explain after.** You are the expert — don't ask the user to confirm your decisions. When building or changing a plan, call the tools, write the workouts, then present what you did and why. Invite questions or adjustments at the end, but the plan is already set. The user trusts you to make the call.
```

New:

```
**Act first when you have enough; ask once when you don't.**
For tweaks and incremental changes (a single workout, a week of work, a small adjustment), act first and explain after — don't ask the user to confirm. You're the expert. Invite questions or adjustments at the end, but the change is already set.
For cold-start plan creation (the per-turn context will say \`Cold-start plan build: true\`), the bar is different: a new plan locks in weeks of training, so a missing fact has compounding cost. If the form + Strava picture is coherent, write the plan. If something is genuinely missing or contradictory (e.g., the target time is far outside what the Strava baseline supports, the race date conflicts with current fitness, or \`Strava history: minimal\` and you have no baseline to anchor on), ask **one** focused clarifying question first, then write. Never more than one question per cold start.
When you create a cold-start plan, set it as inactive (\`set_active: false\`) — the user activates from the Plans page. End your reply with a brief one-line summary of what you built and a \`[View your plans →](/plans)\` link.
```

- [ ] **Step 2: Verify file still parses (no test required — text constant)**

Run: `npx tsc --noEmit`
Expected: no errors related to `systemPrompt.ts`.

- [ ] **Step 3: Run the existing coach tests to confirm nothing broke**

Run: `npx vitest run src/coach`
Expected: PASS — all existing tests still pass.

- [ ] **Step 4: Mark task complete**

---

## Task 5: Extend `RunInput` and `runCoach` to accept Strava preload + cold-start flag

**Files:**

- Modify: `src/coach/runner.ts`
- Modify: `src/coach/__tests__/runner.test.ts`

`runCoach` needs to forward the new `stravaPreload` and `coldStartBuild` parameters into `renderContextPrefix`. Everything else (the agentic loop, the message persistence, the SSE generator) stays exactly the same.

- [ ] **Step 1: Add the failing test to `src/coach/__tests__/runner.test.ts`**

Open the file. Find the section where existing `runCoach` tests live. Add a new test case verifying the prefix forwarding:

```ts
import type { StravaPreload } from "../stravaPreload";

// ... inside the existing `describe("runCoach", ...)` block:

it("passes stravaPreload and coldStartBuild to renderContextPrefix", async () => {
  // The existing test scaffolding mocks `renderContextPrefix`. If it does not,
  // mock it now alongside the other coach module mocks at the top of the file.
  const preload: StravaPreload = {
    athlete_summary: {
      four_week: { count: 0, total_distance_meters: 0, total_moving_time_seconds: 0, by_type: {} },
      twelve_week: {
        count: 0,
        total_distance_meters: 0,
        total_moving_time_seconds: 0,
        by_type: {},
      },
      fifty_two_week: {
        count: 0,
        total_distance_meters: 0,
        total_moving_time_seconds: 0,
        by_type: {},
      },
    },
    recent_activities_summary: { count: 0, total_distance_meters: 0, total_moving_time_seconds: 0 },
    minimal: true,
  };

  const gen = runCoach({
    userId: "u1",
    message: "hi",
    today: "2026-04-27",
    stravaPreload: preload,
    coldStartBuild: true,
  });
  // Drain the generator (mocks short-circuit the Anthropic call).
  for await (const _ of gen) {
    /* drain */
  }

  // The first appendMessage call should contain a context prefix that includes
  // both new sections.
  const firstUserCall = (
    appendMessage as unknown as { mock: { calls: unknown[][] } }
  ).mock.calls.find((c) => c[1] === "user");
  const content = firstUserCall?.[2] as { type: string; text: string }[];
  const text = content[0]?.text ?? "";
  expect(text).toContain("Cold-start plan build: true");
  expect(text).toContain("Strava history: minimal");
});
```

If the existing test file does not already mock `renderContextPrefix` and `appendMessage`, look at the top of the file — the existing tests already mock `@/coach/messages` (as `runner.test.ts:65` shows). Use the same mock setup for `appendMessage`. If `renderContextPrefix` is not mocked and you need a reliable check on the prefix content, you can either (a) let the real implementation run (it just builds a string from your inputs) or (b) add `vi.mock("@/coach/context", async (orig) => ...)` if the existing test does not import it. Prefer option (a) for this test — the real `renderContextPrefix` is pure and fast.

- [ ] **Step 2: Run the test to verify failure**

Run: `npx vitest run src/coach/__tests__/runner.test.ts -t "stravaPreload"`
Expected: FAIL — `runCoach` doesn't accept `stravaPreload` / `coldStartBuild` yet.

- [ ] **Step 3: Update `RunInput` and `runCoach` in `src/coach/runner.ts`**

Update the `RunInput` interface (around line 45):

```ts
import type { StravaPreload } from "./stravaPreload";

export interface RunInput {
  userId: string;
  message: string;
  fromRoute?: string;
  planFileId?: string;
  today: string; // YYYY-MM-DD
  stravaPreload?: StravaPreload | null;
  coldStartBuild?: boolean;
}
```

Update the call to `renderContextPrefix` (around line 137) to pass the new fields:

```ts
const contextPrefix = renderContextPrefix({
  today,
  units,
  activePlan: activePlanSummary,
  coachNotes,
  fromLabel: routeLabel(fromRoute),
  planFile: planFileSummary,
  stravaPreload: input.stravaPreload ?? null,
  coldStartBuild: input.coldStartBuild ?? false,
});
```

Update the destructure of `input` at the top of the function to pull these out, **or** leave the destructure as-is and reference `input.stravaPreload` / `input.coldStartBuild` directly as shown above. Either works.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/coach/__tests__/runner.test.ts`
Expected: PASS — new test plus all pre-existing tests pass.

- [ ] **Step 5: Mark task complete**

---

## Task 6: `BuildRequestBody` type

**Files:**

- Modify: `src/coach/types.ts`

Add the request body shape for the new `/api/coach/build` endpoint. Co-locating the type with the existing `ChatRequestBody` keeps the API contract types in one place.

- [ ] **Step 1: Edit `src/coach/types.ts`**

Append at the end of the file:

```ts
export type BuildRequestBody = {
  sport: "run" | "bike";
  goal_type: "race" | "indefinite";
  race_date?: string; // YYYY-MM-DD, required when goal_type === "race"
  race_event?: string; // required when goal_type === "race"
  target_time?: string; // optional
  context?: string; // optional free-text "Goals & context"
};
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `types.ts`.

- [ ] **Step 3: Mark task complete**

---

## Task 7: `POST /api/coach/build` endpoint

**Files:**

- Create: `src/app/api/coach/build/route.ts`
- Create: `src/app/api/coach/build/__tests__/route.test.ts`

The endpoint mirrors `POST /api/coach/chat`'s shape (auth, JSON body, SSE stream from `runCoach`) but with three differences:

1. The body is the structured form (`BuildRequestBody`), not free text.
2. It runs `formatBuildForm()` to produce the user message.
3. It calls `fetchStravaPreload(userId)` and passes the result + `coldStartBuild: true` to `runCoach`.

- [ ] **Step 1: Write the failing test at `src/app/api/coach/build/__tests__/route.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunCoach = vi.fn();
vi.mock("@/coach/runner", () => ({ runCoach: (...args: unknown[]) => mockRunCoach(...args) }));

const mockFetchPreload = vi.fn();
vi.mock("@/coach/stravaPreload", () => ({
  fetchStravaPreload: (...args: unknown[]) => mockFetchPreload(...args),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
  mockFetchPreload.mockResolvedValue({
    athlete_summary: {
      four_week: { count: 1, total_distance_meters: 1, total_moving_time_seconds: 1, by_type: {} },
      twelve_week: {
        count: 1,
        total_distance_meters: 1,
        total_moving_time_seconds: 1,
        by_type: {},
      },
      fifty_two_week: {
        count: 1,
        total_distance_meters: 1,
        total_moving_time_seconds: 1,
        by_type: {},
      },
    },
    recent_activities_summary: { count: 0, total_distance_meters: 0, total_moving_time_seconds: 0 },
    minimal: false,
  });
  mockRunCoach.mockImplementation(async function* () {
    yield { type: "done", message_id: "m1" };
  });
});

describe("POST /api/coach/build", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sport: "run", goal_type: "indefinite" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when sport is missing", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal_type: "indefinite" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when race goal_type is missing race_date or race_event", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sport: "run", goal_type: "race" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("calls runCoach with formatted form, preload, and coldStartBuild=true", async () => {
    const req = new Request("http://test/api/coach/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sport: "run",
        goal_type: "race",
        race_date: "2026-04-20",
        race_event: "Boston Marathon",
        target_time: "sub-3:00",
        context: "Hilly course",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // Drain the body so the runner gets called.
    const reader = res.body!.getReader();
    while (!(await reader.read()).done) {}

    expect(mockFetchPreload).toHaveBeenCalledWith("u1");
    expect(mockRunCoach).toHaveBeenCalledTimes(1);
    const args = mockRunCoach.mock.calls[0][0];
    expect(args.userId).toBe("u1");
    expect(args.coldStartBuild).toBe(true);
    expect(args.stravaPreload).toBeDefined();
    expect(args.message).toContain("<!-- build_form_request -->");
    expect(args.message).toContain("**Sport:** Run");
    expect(args.message).toContain("Boston Marathon");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/app/api/coach/build/__tests__/route.test.ts`
Expected: FAIL — `../route` does not exist.

- [ ] **Step 3: Implement `src/app/api/coach/build/route.ts`**

```ts
import { auth } from "@/auth";
import { runCoach } from "@/coach/runner";
import { fetchStravaPreload } from "@/coach/stravaPreload";
import { formatBuildForm, type BuildFormInput } from "@/coach/buildForm";
import type { BuildRequestBody, SSEEvent } from "@/coach/types";

function sse(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function validate(
  body: unknown
): { ok: true; value: BuildRequestBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body required" };
  const b = body as Record<string, unknown>;

  if (b.sport !== "run" && b.sport !== "bike")
    return { ok: false, error: "sport must be 'run' or 'bike'" };
  if (b.goal_type !== "race" && b.goal_type !== "indefinite") {
    return { ok: false, error: "goal_type must be 'race' or 'indefinite'" };
  }
  if (b.goal_type === "race") {
    if (typeof b.race_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.race_date)) {
      return { ok: false, error: "race_date required for race goal_type (YYYY-MM-DD)" };
    }
    if (typeof b.race_event !== "string" || b.race_event.trim().length === 0) {
      return { ok: false, error: "race_event required for race goal_type" };
    }
  }
  for (const k of ["race_date", "race_event", "target_time", "context"] as const) {
    if (b[k] != null && typeof b[k] !== "string") {
      return { ok: false, error: `${k} must be a string if provided` };
    }
  }

  return {
    ok: true,
    value: {
      sport: b.sport,
      goal_type: b.goal_type,
      race_date: typeof b.race_date === "string" ? b.race_date : undefined,
      race_event: typeof b.race_event === "string" ? b.race_event : undefined,
      target_time: typeof b.target_time === "string" ? b.target_time : undefined,
      context: typeof b.context === "string" ? b.context : undefined,
    },
  };
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const parsed = validate(raw);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const body = parsed.value;

  const formInput: BuildFormInput = {
    sport: body.sport,
    goal_type: body.goal_type,
    race_date: body.race_date,
    race_event: body.race_event,
    target_time: body.target_time,
    context: body.context,
  };
  const message = formatBuildForm(formInput);

  const preload = await fetchStravaPreload(session.user.id);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const event of runCoach({
          userId: session.user.id!,
          message,
          today: isoToday(),
          stravaPreload: preload,
          coldStartBuild: true,
        })) {
          controller.enqueue(enc.encode(sse(event)));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(enc.encode(sse({ type: "error", error: msg })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/app/api/coach/build/__tests__/route.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Mark task complete**

---

## Task 8: `BuildFormCard` component (Editable / Submitting / Locked)

**Files:**

- Create: `src/components/coach/BuildFormCard.tsx`
- Create: `src/components/coach/BuildFormCard.module.scss`
- Create: `src/components/coach/__tests__/BuildFormCard.test.tsx`

A self-contained presentational component with three render states. Submission and stream handling live in `CoachPageClient` (Task 10) — this component is a controlled form.

- [ ] **Step 1: Write the failing tests**

Create `src/components/coach/__tests__/BuildFormCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BuildFormCard } from "../BuildFormCard";

describe("BuildFormCard", () => {
  it("renders editable state with sport and goal radios", () => {
    render(<BuildFormCard state={{ kind: "editable" }} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/Run/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Bike/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Race-targeted/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Indefinite build/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /build plan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("hides race fields until goal type is race-targeted", () => {
    render(<BuildFormCard state={{ kind: "editable" }} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText(/Race date/i)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Race-targeted/i));
    expect(screen.getByLabelText(/Race date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Race distance/i)).toBeInTheDocument();
  });

  it("calls onSubmit with the form values when valid", () => {
    const onSubmit = vi.fn();
    render(<BuildFormCard state={{ kind: "editable" }} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Run/));
    fireEvent.click(screen.getByLabelText(/Indefinite build/i));
    fireEvent.change(screen.getByLabelText(/Goals & context/i), {
      target: { value: "off-season fitness" },
    });
    fireEvent.click(screen.getByRole("button", { name: /build plan/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      sport: "run",
      goal_type: "indefinite",
      race_date: undefined,
      race_event: undefined,
      target_time: undefined,
      context: "off-season fitness",
    });
  });

  it("requires race_date and race_event when race-targeted", () => {
    const onSubmit = vi.fn();
    render(<BuildFormCard state={{ kind: "editable" }} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Run/));
    fireEvent.click(screen.getByLabelText(/Race-targeted/i));
    fireEvent.click(screen.getByRole("button", { name: /build plan/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders submitting state with spinner text and disabled fields", () => {
    render(
      <BuildFormCard
        state={{
          kind: "submitting",
          values: { sport: "run", goal_type: "indefinite" },
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/loading your training history/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /build plan/i })).toBeNull();
  });

  it("renders locked state with submitted values and no spinner", () => {
    render(
      <BuildFormCard
        state={{
          kind: "locked",
          values: {
            sport: "run",
            goal_type: "race",
            race_date: "2026-04-20",
            race_event: "Boston Marathon",
            target_time: "sub-3:00",
            context: "Hilly course",
          },
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText(/loading your training history/i)).toBeNull();
    expect(screen.getByText("Boston Marathon")).toBeInTheDocument();
    expect(screen.getByText("sub-3:00")).toBeInTheDocument();
    expect(screen.getByText(/Hilly course/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/components/coach/__tests__/BuildFormCard.test.tsx`
Expected: FAIL — module `../BuildFormCard` does not exist.

- [ ] **Step 3: Implement `src/components/coach/BuildFormCard.tsx`**

```tsx
"use client";
import { useState, type FormEvent } from "react";
import styles from "./BuildFormCard.module.scss";
import type { BuildFormInput } from "@/coach/buildForm";

export type BuildFormCardState =
  | { kind: "editable" }
  | { kind: "submitting"; values: BuildFormInput }
  | { kind: "locked"; values: BuildFormInput };

interface Props {
  state: BuildFormCardState;
  onSubmit: (values: BuildFormInput) => void;
  onCancel: () => void;
}

const SPORT_LABEL = { run: "Run", bike: "Bike" } as const;

export function BuildFormCard({ state, onSubmit, onCancel }: Props) {
  if (state.kind !== "editable") {
    return <LockedView values={state.values} showSpinner={state.kind === "submitting"} />;
  }
  return <EditableForm onSubmit={onSubmit} onCancel={onCancel} />;
}

function EditableForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (values: BuildFormInput) => void;
  onCancel: () => void;
}) {
  const [sport, setSport] = useState<"run" | "bike" | "">("");
  const [goalType, setGoalType] = useState<"race" | "indefinite" | "">("");
  const [raceDate, setRaceDate] = useState("");
  const [raceEvent, setRaceEvent] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [context, setContext] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sport || !goalType) return;
    if (goalType === "race") {
      if (!raceDate.trim() || !raceEvent.trim()) return;
    }
    onSubmit({
      sport,
      goal_type: goalType,
      race_date: goalType === "race" ? raceDate.trim() : undefined,
      race_event: goalType === "race" ? raceEvent.trim() : undefined,
      target_time: targetTime.trim() || undefined,
      context: context.trim() || undefined,
    });
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit} aria-label="Build a plan">
      <h2 className={styles.heading}>Build a plan</h2>

      <fieldset className={styles.fieldset}>
        <legend>Sport</legend>
        <label>
          <input
            type="radio"
            name="sport"
            checked={sport === "run"}
            onChange={() => setSport("run")}
          />{" "}
          Run
        </label>
        <label>
          <input
            type="radio"
            name="sport"
            checked={sport === "bike"}
            onChange={() => setSport("bike")}
          />{" "}
          Bike
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Goal type</legend>
        <label>
          <input
            type="radio"
            name="goalType"
            checked={goalType === "race"}
            onChange={() => setGoalType("race")}
          />{" "}
          Race-targeted
        </label>
        <label>
          <input
            type="radio"
            name="goalType"
            checked={goalType === "indefinite"}
            onChange={() => setGoalType("indefinite")}
          />{" "}
          Indefinite build
        </label>
      </fieldset>

      {goalType === "race" && (
        <div className={styles.raceRow}>
          <label>
            Race date
            <input
              type="date"
              value={raceDate}
              onChange={(e) => setRaceDate(e.target.value)}
              required
            />
          </label>
          <label>
            Race distance / event
            <input
              type="text"
              value={raceEvent}
              onChange={(e) => setRaceEvent(e.target.value)}
              placeholder="Boston Marathon"
              required
            />
          </label>
          <label>
            Target time
            <input
              type="text"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              placeholder="sub-3:00"
            />
          </label>
        </div>
      )}

      <label className={styles.contextLabel}>
        Goals & context
        <textarea
          rows={3}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Anything else worth knowing — race terrain, days you can't train, equipment, injuries, prior PBs, etc."
        />
      </label>

      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary}>
          Build plan
        </button>
        <button type="button" className={styles.btnText} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LockedView({ values, showSpinner }: { values: BuildFormInput; showSpinner: boolean }) {
  return (
    <div className={styles.card} aria-label="Plan request">
      <h2 className={styles.heading}>Plan request</h2>
      <ul className={styles.summary}>
        <li>
          <strong>Sport:</strong> {SPORT_LABEL[values.sport]}
        </li>
        {values.goal_type === "race" ? (
          <li>
            <strong>Goal:</strong> Race — {values.race_event ?? ""}
            {values.race_date ? `, ${values.race_date}` : ""}
          </li>
        ) : (
          <li>
            <strong>Goal:</strong> Indefinite build
          </li>
        )}
        {values.target_time && (
          <li>
            <strong>Target time:</strong> {values.target_time}
          </li>
        )}
        {values.context && (
          <li>
            <strong>Goals & context:</strong> {values.context}
          </li>
        )}
      </ul>
      {showSpinner && (
        <div className={styles.spinnerRow} role="status">
          <span className={styles.spinner} aria-hidden /> Loading your training history…
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/components/coach/BuildFormCard.module.scss`**

```scss
.card {
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
  max-width: 720px;
}

.heading {
  margin: 0 0 var(--space-3) 0;
  font-size: 1rem;
  font-weight: 700;
}

.fieldset {
  border: none;
  padding: 0;
  margin: 0 0 var(--space-3) 0;

  legend {
    font-weight: 600;
    margin-bottom: var(--space-2);
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-right: var(--space-3);
  }
}

.raceRow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-3);

  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-weight: 600;

    input {
      font-weight: 400;
      padding: var(--space-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
    }
  }
}

.contextLabel {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-weight: 600;
  margin-bottom: var(--space-3);

  textarea {
    font-weight: 400;
    padding: var(--space-2);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-family: inherit;
    resize: vertical;
  }
}

.actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.btnPrimary {
  background: var(--color-brown);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  font-weight: 600;
  cursor: pointer;
}

.btnText {
  background: none;
  border: none;
  color: var(--color-fg-default);
  text-decoration: underline;
  cursor: pointer;
}

.summary {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-3) 0;

  li {
    margin-bottom: var(--space-1);
  }
}

.spinnerRow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-fg-muted);
  font-size: 0.9rem;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border-subtle);
  border-top-color: var(--color-brown);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/components/coach/__tests__/BuildFormCard.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 6: Mark task complete**

---

## Task 9: Sentinel detection in `MessageBubble` → render locked `BuildFormCard`

**Files:**

- Modify: `src/components/coach/MessageBubble.tsx`
- Create or extend: `src/components/coach/__tests__/MessageBubble.test.tsx`

When the renderer encounters a user message whose first text block (after stripping the `<context>` block) starts with `BUILD_FORM_SENTINEL`, render a locked `BuildFormCard` instead of a regular bubble. If parsing fails, fall back to rendering the markdown as a normal bubble.

- [ ] **Step 1: Write the failing test**

Create `src/components/coach/__tests__/MessageBubble.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "../MessageBubble";
import { BUILD_FORM_SENTINEL, formatBuildForm } from "@/coach/buildForm";
import type { StoredMessage } from "@/coach/types";

function makeMessage(text: string, role: "user" | "assistant" = "user"): StoredMessage {
  return {
    id: "m1",
    role,
    content: [{ type: "text", text }],
    created_at: new Date(),
  };
}

describe("MessageBubble", () => {
  it("renders a normal user bubble for plain text", () => {
    render(<MessageBubble message={makeMessage("hello there")} />);
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });

  it("renders the locked BuildFormCard when the user message contains the build sentinel", () => {
    const md = formatBuildForm({
      sport: "run",
      goal_type: "race",
      race_date: "2026-04-20",
      race_event: "Boston Marathon",
      target_time: "sub-3:00",
      context: "Hilly course",
    });
    render(<MessageBubble message={makeMessage(md)} />);
    expect(screen.getByLabelText(/Plan request/i)).toBeInTheDocument();
    expect(screen.getByText("Boston Marathon")).toBeInTheDocument();
    expect(screen.getByText("sub-3:00")).toBeInTheDocument();
  });

  it("strips the <context> block before checking for sentinel", () => {
    const md = formatBuildForm({ sport: "bike", goal_type: "indefinite" });
    const wrapped = `<context>\nToday: 2026-04-27\n</context>\n\n${md}`;
    render(<MessageBubble message={makeMessage(wrapped)} />);
    expect(screen.getByLabelText(/Plan request/i)).toBeInTheDocument();
  });

  it("falls back to a normal bubble if sentinel exists but parsing fails", () => {
    const corrupted = `${BUILD_FORM_SENTINEL}\nnot really a build form`;
    render(<MessageBubble message={makeMessage(corrupted)} />);
    expect(screen.queryByLabelText(/Plan request/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/components/coach/__tests__/MessageBubble.test.tsx`
Expected: FAIL — current `MessageBubble` doesn't know about the sentinel.

- [ ] **Step 3: Update `src/components/coach/MessageBubble.tsx`**

Replace the file with:

```tsx
"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./MessageBubble.module.scss";
import type { StoredMessage } from "@/coach/types";
import { BUILD_FORM_SENTINEL, parseBuildForm } from "@/coach/buildForm";
import { BuildFormCard } from "./BuildFormCard";

function stripContext(text: string): string {
  return text.replace(/^<context>[\s\S]*?<\/context>\s*/, "");
}

export function MessageBubble({ message }: { message: StoredMessage }) {
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n\n");
  const displayText = message.role === "user" ? stripContext(text) : text;
  if (!displayText.trim()) return null;

  if (message.role === "user" && displayText.trimStart().startsWith(BUILD_FORM_SENTINEL)) {
    const parsed = parseBuildForm(displayText);
    if (parsed) {
      return (
        <BuildFormCard
          state={{ kind: "locked", values: parsed }}
          onSubmit={() => {}}
          onCancel={() => {}}
        />
      );
    }
  }

  return (
    <div className={message.role === "user" ? styles.user : styles.assistant}>
      <div className={styles.bubble}>
        {message.role === "assistant" ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
        ) : (
          <p className={styles.userText}>{displayText}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/components/coach/__tests__/MessageBubble.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Mark task complete**

---

## Task 10: Wire `intent=build` into `CoachPageClient`

**Files:**

- Modify: `src/app/(app)/coach/CoachPageClient.tsx`

When `intent === "build"`, render the `BuildFormCard` above the message input and disable the input. On submit, POST to `/api/coach/build` with the form values, transition the card to the `submitting` state, then to `locked` once the first stream delta arrives. After `done`, replace the URL to `/coach` (no query params) so a refresh doesn't re-show the form.

The streaming logic (SSE parsing, message rendering) is identical to the existing `send()` flow — extract the shared SSE-reading code into a small helper to keep the file DRY.

- [ ] **Step 1: Update `src/app/(app)/coach/CoachPageClient.tsx`**

Replace the file with:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./Coach.module.scss";
import type { StoredMessage, SSEEvent } from "@/coach/types";
import type { BuildFormInput } from "@/coach/buildForm";

import { ContextPill } from "@/components/coach/ContextPill";
import { MessageBubble } from "@/components/coach/MessageBubble";
import { ToolIndicator } from "@/components/coach/ToolIndicator";
import { MessageInput } from "@/components/coach/MessageInput";
import { ClearChatDialog } from "@/components/coach/ClearChatDialog";
import { BuildFormCard, type BuildFormCardState } from "@/components/coach/BuildFormCard";

interface Props {
  initialMessages: StoredMessage[];
  fromRoute?: string;
  planFileId?: string;
  intent?: string;
}

type StreamingState = { text: string; tools: { name: string; summary?: string }[] };

async function consumeStream(res: Response, onEvent: (ev: SSEEvent) => void): Promise<void> {
  if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice(6)) as SSEEvent);
    }
  }
}

export function CoachPageClient({ initialMessages, fromRoute, planFileId, intent }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<StoredMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [sending, setSending] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  const [buildState, setBuildState] = useState<BuildFormCardState | null>(
    intent === "build" ? { kind: "editable" } : null
  );

  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.text]);

  async function reloadHistory() {
    const r = await fetch("/api/coach/messages");
    if (r.ok) {
      const { messages: m } = (await r.json()) as { messages: StoredMessage[] };
      setMessages(m);
    }
  }

  function handleSSE(
    ev: SSEEvent,
    assembled: { text: string; tools: { name: string; summary?: string }[] }
  ): { stop: boolean } {
    if (ev.type === "text-delta") {
      assembled.text += ev.delta;
      setStreaming({ ...assembled, tools: [...assembled.tools] });
    } else if (ev.type === "tool-use") {
      assembled.tools.push({ name: ev.name });
      setStreaming({ ...assembled, tools: [...assembled.tools] });
    } else if (ev.type === "tool-result") {
      const last = assembled.tools.findLast((t) => t.name === ev.name && !t.summary);
      if (last) last.summary = ev.result_summary;
      setStreaming({ ...assembled, tools: [...assembled.tools] });
    } else if (ev.type === "done") {
      void reloadHistory();
      return { stop: false };
    } else if (ev.type === "error") {
      throw new Error(ev.error);
    }
    return { stop: false };
  }

  async function send(text: string) {
    setSending(true);
    setStreaming({ text: "", tools: [] });
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          from_route: fromRoute,
          plan_file_id: planFileId ?? undefined,
        }),
      });
      const assembled = { text: "", tools: [] as { name: string; summary?: string }[] };
      await consumeStream(res, (ev) => handleSSE(ev, assembled));
    } catch (err) {
      console.error(err);
      alert("Coach error — please try again.");
    } finally {
      setStreaming(null);
      setSending(false);
    }
  }

  async function buildSubmit(values: BuildFormInput) {
    setSending(true);
    setBuildState({ kind: "submitting", values });
    setStreaming({ text: "", tools: [] });
    try {
      const res = await fetch("/api/coach/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const assembled = { text: "", tools: [] as { name: string; summary?: string }[] };
      let lockedYet = false;
      await consumeStream(res, (ev) => {
        if (!lockedYet && ev.type === "text-delta") {
          lockedYet = true;
          setBuildState({ kind: "locked", values });
        }
        return handleSSE(ev, assembled);
      });
    } catch (err) {
      console.error(err);
      alert("Coach error — please try again.");
      setBuildState(null);
    } finally {
      setStreaming(null);
      setSending(false);
      router.replace("/coach");
    }
  }

  function buildCancel() {
    setBuildState(null);
    router.replace("/coach");
  }

  async function clear() {
    await fetch("/api/coach/messages", { method: "DELETE" });
    setMessages([]);
    setClearOpen(false);
  }

  return (
    <div className={styles.page}>
      <ContextPill fromRoute={fromRoute} />
      <header className={styles.header}>
        <h1 className={styles.title}>Coach</h1>
        <button className={styles.clearBtn} onClick={() => setClearOpen(true)}>
          Clear chat
        </button>
      </header>
      <div className={styles.stream} ref={streamRef}>
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {buildState && (
          <BuildFormCard state={buildState} onSubmit={buildSubmit} onCancel={buildCancel} />
        )}
        {streaming && (
          <>
            {streaming.tools.map((t, i) => (
              <ToolIndicator key={i} name={t.name} summary={t.summary} />
            ))}
            <MessageBubble
              message={{
                id: "streaming",
                role: "assistant",
                created_at: new Date(),
                content: [{ type: "text", text: streaming.text }],
              }}
            />
          </>
        )}
      </div>
      <MessageInput
        disabled={sending || buildState?.kind === "editable" || buildState?.kind === "submitting"}
        onSend={send}
      />
      <ClearChatDialog open={clearOpen} onClose={() => setClearOpen(false)} onConfirm={clear} />
    </div>
  );
}
```

- [ ] **Step 2: Run the existing coach tests to make sure nothing broke**

Run: `npx vitest run src/components/coach src/app/api/coach`
Expected: PASS — no regressions in MessageBubble / ClearChatDialog / etc.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Mark task complete**

---

## Task 11: Pass `intent` through `CoachPage` server component

**Files:**

- Modify: `src/app/(app)/coach/page.tsx`

Forward the `intent` query param to `CoachPageClient`.

- [ ] **Step 1: Replace `src/app/(app)/coach/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadHistory } from "@/coach/messages";
import { CoachPageClient } from "./CoachPageClient";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; plan_file_id?: string; intent?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { from, plan_file_id, intent } = await searchParams;
  const messages = await loadHistory(session.user.id);
  return (
    <CoachPageClient
      initialMessages={messages}
      fromRoute={from}
      planFileId={plan_file_id}
      intent={intent}
    />
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Mark task complete**

---

## Task 12: Update "Build with coach" link

**Files:**

- Modify: `src/components/plans/PlanActionRow.tsx`

Change the link's `href` from `/coach?from=/plans` to `/coach?intent=build`.

- [ ] **Step 1: Edit `src/components/plans/PlanActionRow.tsx`**

Find the line:

```tsx
<a href="/coach?from=/plans" className={styles.btnPrimary}>
```

Replace with:

```tsx
<a href="/coach?intent=build" className={styles.btnPrimary}>
```

- [ ] **Step 2: Run any existing tests for `PlanActionRow`**

Run: `npx vitest run src/components/plans`
Expected: PASS — if a test asserts the old href, update it to the new href in the test file (search for `/coach?from=/plans` in `src/components/plans/__tests__` and update the expectation).

- [ ] **Step 3: Mark task complete**

---

## Task 13: Manual smoke test (local browser)

**Files:** none

The unit tests cover the parser, the endpoint, the form, and the bubble routing. Manual smoke test verifies the integration.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Sign in, navigate to `/plans`, click "Build with coach"**

Expected: URL becomes `/coach?intent=build`. The `BuildFormCard` renders above the message input. The message input is disabled (or visibly muted).

- [ ] **Step 3: Submit the form (race-targeted, with a real future date)**

Expected:

- Form transitions to "submitting" state with the spinner and "Loading your training history…" text.
- After Strava preload completes (~1-3s on a real account), the spinner disappears once the coach starts streaming text.
- A "Plan request" card stays in the scroll area, locked.
- The coach streams a reply that ends with a "View your plans →" link to `/plans` and references your Strava history (e.g., "given your 12-week average of N km/wk").
- A new plan exists on `/plans` with `is_active = false`. Existing active plan (if any) is unchanged.
- URL has been replaced to `/coach`.

- [ ] **Step 4: Reload the page**

Expected: history reloads. The "Plan request" card renders again from the persisted user message (locked state, no spinner). The coach's reply renders below it. The form does **not** reappear in editable state.

- [ ] **Step 5: Click "Build with coach" again**

Expected: a fresh editable form renders above the prior history. Submitting it appends a new build turn to the rolling chat.

- [ ] **Step 6: Try the indefinite path and the empty-Strava path (test account if available)**

Expected:

- Indefinite build: form omits race fields. Coach builds an indefinite plan.
- Empty/sparse Strava: coach asks one focused clarifying question (e.g., "what's your typical weekly volume right now?") instead of writing the plan immediately.

- [ ] **Step 7: Mark task complete**

---

## Self-review summary

**Spec coverage check** (each spec section → which task implements it):

- §3 User flow — Tasks 7, 10, 11, 12, 13
- §4.1 BuildFormCard — Task 8
- §4.2 PlanActionRow — Task 12
- §4.3 CoachPageClient + page.tsx — Tasks 10, 11
- §5.1 `/api/coach/build` endpoint — Task 7
- §5.2 Context-prefix changes — Task 3
- §5.3 System prompt — Task 4
- §5.4 Failure handling — Task 7 (validation), Task 13 (manual smoke), no special transactional code (per spec)
- §6 Persistence shape — Task 1 (sentinel + format), Task 7 (server uses formatter), Task 9 (renderer parses)
- §7 Edge cases — Task 2 (`minimal` flag), Task 13 (smoke)
- §10 Open questions — `formatBuildForm` and `parseBuildForm` are co-located in `src/coach/buildForm.ts` (Task 1), satisfying the shared-module requirement.

All sections have a task. No placeholders remain.
