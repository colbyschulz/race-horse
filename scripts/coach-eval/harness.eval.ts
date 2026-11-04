/* eslint-disable */
// @ts-nocheck
// Old vs new coach comparison. Spends real API money, capped by EVAL_BUDGET.
//   EVAL_MODE=smoke|run|judge|report npx vitest run --config scripts/coach-eval/vitest.config.ts
import fs from "node:fs";
import path from "node:path";
import { it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

// No code path here may reach a database.
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/strava/date-queries", () => ({ getActivitiesForDateRange: vi.fn() }));
vi.mock("@/server/strava/queries", () => ({}));
vi.mock("@/server/plans/queries", () => ({}));
vi.mock("@/server/plans/files", () => ({}));

import { COACH_SYSTEM_PROMPT as NEW_PROMPT } from "@/server/coach/system-prompt";
import { COACH_SYSTEM_PROMPT as OLD_PROMPT } from "./baseline/system-prompt";
import { renderRecentTraining as renderNew } from "@/server/coach/recent-training";
import { renderRecentTraining as renderOld } from "./baseline/recent-training";
import { renderContextPrefix } from "@/server/coach/context";
import { getTools, getColdStartTools } from "@/server/coach/tools/index";
import { FIXTURES, TODAY, addDays, dayName } from "./fixtures";
import { SCENARIOS, PAIR_RUBRIC, CHAT_ARMS, BUILD_ARMS } from "./scenarios";

const OUT = path.resolve(__dirname, "out");
const RUNS = path.join(OUT, "runs");
const JUDGED = path.join(OUT, "judged");
const ABORTED = path.join(OUT, "aborted");
fs.mkdirSync(RUNS, { recursive: true });
fs.mkdirSync(JUDGED, { recursive: true });
fs.mkdirSync(ABORTED, { recursive: true });

const BUDGET = Number(process.env.EVAL_BUDGET ?? 14);
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 4);
const MODE = process.env.EVAL_MODE ?? "smoke";
const MAX_CALLS = { chat: 14, build: 40 };

const OLD_DEEP_DESCRIPTION =
  "Switch this conversation to the deep-planning model for the rest of this turn and the athlete's next turn. Call it BEFORE reading the plan or writing any workouts when the request is a multi-week restructure: rebuilding 3+ weeks, changing the plan's arc or peak, re-planning after injury/illness/a missed block, or moving the goal race. Do not call it for single-workout or single-week edits — those are handled directly. Returns immediately; continue working after it returns.";

const ARMS = {
  "old-sonnet5": { prompt: OLD_PROMPT, render: renderOld, oldDeep: true, model: "claude-sonnet-5", effort: null },
  "old-opus55": { prompt: OLD_PROMPT, render: renderOld, oldDeep: true, model: "claude-opus-5-5", effort: "high" },
  "new-sonnet5": { prompt: NEW_PROMPT, render: renderNew, model: "claude-sonnet-5", effort: null },
  "new-sonnet55": { prompt: NEW_PROMPT, render: renderNew, model: "claude-sonnet-5-5", effort: null },
  "new-opus55": { prompt: NEW_PROMPT, render: renderNew, model: "claude-opus-5-5", effort: "high" },
  "new-opus55-xhigh": { prompt: NEW_PROMPT, render: renderNew, model: "claude-opus-5-5", effort: "xhigh", chatMax: 32000, buildMax: 64000 },
  "new-fable51": { prompt: NEW_PROMPT, render: renderNew, model: "claude-fable-5-1", effort: "high", chatMax: 32000, buildMax: 64000 },
};

const DEEP = { model: "claude-opus-5-5", effort: "high", max_tokens: 32000 };
const CHAT_MAX = 16000;
const BUILD_MAX = 32000;
const CACHE_1H = { type: "ephemeral", ttl: "1h" };

const RATES = {
  "claude-sonnet-5": { in: 2, out: 10, read: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, read: 0.2 },
  "claude-opus-5-5": { in: 4, out: 20, read: 0.2 },
  "claude-fable-5-1": { in: 10, out: 50, read: 0.25 },
};

function cost(model, u) {
  const r = RATES[model];
  return (
    ((u.input_tokens ?? 0) * r.in +
      (u.output_tokens ?? 0) * r.out +
      (u.cache_read_input_tokens ?? 0) * r.read +
      (u.cache_creation_input_tokens ?? 0) * r.in * 2) /
    1e6
  );
}

function log(line) {
  const text = `${new Date().toISOString().slice(11, 19)} ${line}`;
  console.log(text);
  fs.appendFileSync(path.join(OUT, "progress.log"), text + "\n");
}

function spentSoFar() {
  let total = 0;
  for (const dir of [RUNS, JUDGED, ABORTED]) {
    for (const f of fs.readdirSync(dir)) {
      try {
        total += JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).cost ?? 0;
      } catch {}
    }
  }
  return total;
}

let liveSpend = 0;
class BudgetExceeded extends Error {}

function getClient() {
  try {
    process.loadEnvFile(path.resolve(__dirname, "../../.env"));
  } catch {}
  delete process.env.DATABASE_URL;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 270_000, maxRetries: 4 });
}

// ---------- Fake tool backend ----------

function mapWorkout(w) {
  const m = w.distance_meters != null ? parseFloat(w.distance_meters) : null;
  return {
    id: w.id,
    date: w.date,
    day: dayName(w.date),
    type: w.type,
    distance_mi: m != null ? Math.round((m / 1609.344) * 10) / 10 : null,
    distance_km: m != null ? Math.round((m / 1000) * 10) / 10 : null,
    duration_minutes: w.duration_seconds != null ? Math.round(w.duration_seconds / 60) : null,
    notes: w.notes,
    secondary: w.secondary,
  };
}

function weeklyTotals(rows) {
  const totals = {};
  for (const w of rows) {
    let m = w.distance_meters != null ? parseFloat(w.distance_meters) : 0;
    if (w.secondary?.distance_km != null) m += w.secondary.distance_km * 1000;
    const d = new Date(`${w.date}T12:00:00Z`);
    const mon = addDays(w.date, -((d.getUTCDay() + 6) % 7));
    totals[mon] = (totals[mon] ?? 0) + m;
  }
  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, m]) => ({
      week_start,
      total_mi: Math.round((m / 1609.344) * 10) / 10,
      total_km: Math.round((m / 1000) * 10) / 10,
    }));
}

function readPlan(store, input) {
  const from = input.from ?? (input.to ? null : addDays(TODAY, -14));
  const to = input.to ?? (input.from ? null : addDays(TODAY, 28));
  const inWindow = store.workouts.filter((w) => (!from || w.date >= from) && (!to || w.date <= to));
  return {
    plan: store.plan,
    workouts: inWindow.map(mapWorkout),
    weekly_totals: weeklyTotals(store.workouts),
    window: {
      from,
      to,
      workouts_in_window: inWindow.length,
      total_workouts: store.workouts.length,
      note: `Workouts limited to ${from ?? "plan start"} through ${to ?? "plan end"}. Weekly totals cover the whole plan. Pass from/to to read other weeks.`,
    },
  };
}

function runTool(store, name, input) {
  switch (name) {
    case "get_active_plan":
      return store.plan.is_active ? readPlan(store, input ?? {}) : { plan: null, workouts: [], weekly_totals: [] };
    case "get_plan":
      if (input.plan_id !== store.plan.id && !store.created[input.plan_id]) throw new Error("plan not found or not owned");
      if (store.created[input.plan_id]) return { plan: store.created[input.plan_id], workouts: [], weekly_totals: [] };
      return readPlan(store, input);
    case "list_plans":
      return { plans: [{ ...store.plan, workout_count: store.workouts.length }, ...Object.values(store.created)] };
    case "create_plan": {
      const id = `created-${Object.keys(store.created).length + 1}`;
      store.created[id] = { id, ...input };
      return { plan_id: id };
    }
    case "update_workouts": {
      const days = [];
      let upserted = 0;
      let deleted = 0;
      for (const op of input.operations ?? []) {
        if (op.op === "delete") {
          store.workouts = store.workouts.filter((w) => w.date !== op.date);
          deleted++;
          continue;
        }
        const existing = store.workouts.find((w) => w.date === op.date);
        if (op.op === "set_secondary") {
          if (existing) existing.secondary = op.secondary;
          upserted++;
          days.push({ date: op.date, day: dayName(op.date), type: existing?.type, secondary: op.secondary?.type ?? null });
          continue;
        }
        const secondary = op.secondary === undefined ? (existing?.secondary ?? null) : op.secondary;
        if (input.plan_id === store.plan.id) {
          store.workouts = store.workouts.filter((w) => w.date !== op.date);
          store.workouts.push({
            id: `w-${op.date}`,
            plan_id: store.plan.id,
            date: op.date,
            type: op.workout.type,
            distance_meters: op.workout.distance_km != null ? String(op.workout.distance_km * 1000) : null,
            duration_seconds: op.workout.duration_minutes != null ? op.workout.duration_minutes * 60 : null,
            notes: op.workout.notes ?? "",
            secondary,
          });
          store.workouts.sort((a, b) => a.date.localeCompare(b.date));
        }
        upserted++;
        days.push({ date: op.date, day: dayName(op.date), type: op.workout.type, secondary: secondary?.type ?? null });
      }
      return { upserted, deleted, week_number: input.week_number, total_weeks: input.total_weeks, days };
    }
    case "set_active_plan":
    case "archive_plan":
    case "update_activity_match":
      return { ok: true };
    case "finalize_plan":
      store.finalized = true;
      return { ok: true };
    case "get_recent_activities": {
      const cutoff = addDays(TODAY, -(input?.days ?? 14));
      const rows = store.activities
        .filter((a) => a.start_date.slice(0, 10) >= cutoff)
        .map(({ _laps, ...a }) => a)
        .sort((a, b) => b.start_date.localeCompare(a.start_date));
      return {
        activities: rows,
        summary: {
          count: rows.length,
          total_distance_meters: rows.reduce((s, r) => s + r.distance_meters, 0),
          total_moving_time_seconds: rows.reduce((s, r) => s + r.moving_time_seconds, 0),
        },
      };
    }
    case "get_activity_laps": {
      const a = store.activities.find((x) => x.id === input.activity_id);
      if (!a) throw new Error(`activity not found: ${input.activity_id}`);
      const { _laps, ...activity } = a;
      return { activity, laps: _laps };
    }
    case "get_athlete_summary":
      return store.rollups;
    case "update_coach_notes":
      store.coachNotes = input.content;
      return { ok: true, bytes: input.content.length };
    case "update_plan_notes":
      store.plan.coach_notes = input.content;
      return { ok: true, bytes: input.content.length };
    case "read_uploaded_file":
      throw new Error("no uploaded file");
    case "request_deep_planning":
      return {
        ok: true,
        note: "Deep planning mode is active for the rest of this turn and the athlete's next turn. Read the affected weeks with get_plan (pass from/to), then proceed.",
      };
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------- Mirrors of runner.ts request shaping ----------

function withCacheBreakpoint(messages) {
  if (messages.length < 2) return messages;
  const out = messages.map((m) => ({ ...m }));
  const target = out[out.length - 2];
  const content = Array.isArray(target.content) ? [...target.content] : [{ type: "text", text: target.content }];
  if (content.length > 0) {
    content[content.length - 1] = { ...content[content.length - 1], cache_control: CACHE_1H };
    out[out.length - 2] = { ...target, content };
  }
  return out;
}

const RT_RE = /<recent_training>[\s\S]*?<\/recent_training>/g;
const LIMIT = 3000;

function isHuman(m) {
  if (m.role !== "user") return false;
  return typeof m.content === "string" || m.content.some((b) => b.type === "text");
}

function compactOlder(messages) {
  let boundary = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isHuman(messages[i])) {
      boundary = i;
      break;
    }
  }
  if (boundary <= 0) return messages;
  return messages.map((m, i) => {
    if (i >= boundary || !Array.isArray(m.content)) return m;
    const content = m.content.map((b) => {
      if (b.type === "tool_result") {
        const text = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
        return text.length <= LIMIT ? b : { ...b, content: text.slice(0, LIMIT) + "…[truncated]" };
      }
      if (b.type === "tool_use") {
        const text = JSON.stringify(b.input);
        return text.length <= LIMIT ? b : { ...b, input: { _truncated: text.slice(0, LIMIT) + "…" } };
      }
      if (b.type === "text" && m.role === "user" && b.text.includes("<recent_training>")) {
        return { ...b, text: b.text.replace(RT_RE, "<recent_training>(elided — superseded by the latest message)</recent_training>") };
      }
      return b;
    });
    return { ...m, content };
  });
}

function contextFor(store, arm, scenario, { firstTurn }) {
  const cold = scenario.route === "build";
  let recentTraining = null;
  if (!cold) {
    const from = addDays(TODAY, -14);
    const lookahead = addDays(TODAY, 7);
    const rt = {
      from,
      to: TODAY,
      lookahead_to: lookahead,
      sport: store.plan.sport,
      planned: store.workouts
        .filter((w) => w.date >= from && w.date <= lookahead)
        .map((w) => ({
          date: w.date,
          type: w.type,
          distance_meters: w.distance_meters,
          duration_seconds: w.duration_seconds,
          notes: w.notes,
          secondary: w.secondary,
        })),
      actual: store.activities
        .filter((a) => a.start_date.slice(0, 10) >= from)
        .map((a) => ({
          date: a.start_date.slice(0, 10),
          name: a.name,
          type: a.type,
          distance_meters: a.distance_meters,
          moving_time_seconds: a.moving_time_seconds,
          avg_pace_seconds_per_km: a.avg_pace_seconds_per_km,
          avg_hr: a.avg_hr,
          matched: false,
        })),
    };
    recentTraining = ARMS[arm].render(rt, store.units);
  }
  const active = store.plan.is_active
    ? {
        title: store.plan.title,
        weeks_left: Math.max(0, Math.round((new Date(store.plan.end_date) - new Date(TODAY)) / (7 * 864e5))),
        workout_count: store.workouts.length,
        completed: store.workouts.filter((w) => w.date < TODAY).length,
      }
    : null;
  const rows = store.activities;
  return renderContextPrefix({
    today: TODAY,
    units: store.units,
    activePlan: active,
    coachNotes: store.coachNotes,
    planCoachNotes: store.plan.coach_notes,
    fromLabel: null,
    fromDetail: null,
    planFile: null,
    stravaPreload:
      cold && firstTurn
        ? {
            athlete_summary: store.rollups,
            recent_activities_summary: {
              count: rows.length,
              total_distance_meters: rows.reduce((s, r) => s + r.distance_meters, 0),
              total_moving_time_seconds: rows.reduce((s, r) => s + r.moving_time_seconds, 0),
            },
            minimal: store.rollups.twelve_week.count < 4,
          }
        : null,
    coldStartBuild: cold,
    coldStartPlanId: cold ? store.plan.id : null,
    recentTraining,
    deepPlanning: false,
  });
}

function toolsFor(store, arm, scenario) {
  const raw = scenario.route === "build" ? getColdStartTools(store.plan.id) : getTools(store.plan.id);
  return raw
    .filter((t) => t.name !== "web_search")
    .map((t) => (t.name === "request_deep_planning" && ARMS[arm].oldDeep ? { ...t, description: OLD_DEEP_DESCRIPTION } : t));
}

// ---------- Running one configuration on one scenario ----------

async function runTurn(client, ctx, messages, transcript) {
  const { armCfg, scenario, tools, store, record } = ctx;
  const build = scenario.route === "build";
  let route = build ? "build" : "chat";
  const limit = MAX_CALLS[scenario.route];
  let calls = 0;
  while (true) {
    if (liveSpend >= BUDGET) throw new BudgetExceeded();
    if (++calls > limit) {
      transcript.push({ note: `harness stopped after ${limit} API calls` });
      return;
    }
    const isSonnet = armCfg.model.includes("sonnet");
    const cfg = build
      ? { model: armCfg.model, effort: armCfg.effort, max_tokens: armCfg.buildMax ?? BUILD_MAX }
      : route === "deep" && isSonnet
        ? DEEP
        : route === "deep"
          ? { model: armCfg.model, effort: armCfg.effort, max_tokens: armCfg.buildMax ?? BUILD_MAX }
          : { model: armCfg.model, effort: armCfg.effort, max_tokens: armCfg.chatMax ?? CHAT_MAX };
    const stream = client.messages.stream({
      model: cfg.model,
      max_tokens: cfg.max_tokens,
      thinking: { type: "adaptive" },
      ...(cfg.effort ? { output_config: { effort: cfg.effort } } : {}),
      system: [{ type: "text", text: armCfg.prompt, cache_control: CACHE_1H }],
      tools,
      messages: withCacheBreakpoint(messages),
    });
    const final = await stream.finalMessage();
    const c = cost(cfg.model, final.usage);
    record.cost += c;
    liveSpend += c;
    record.apiCalls++;
    record.modelsUsed[cfg.model] = (record.modelsUsed[cfg.model] ?? 0) + 1;
    for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) {
      record.usage[k] = (record.usage[k] ?? 0) + (final.usage[k] ?? 0);
    }
    for (const b of final.content) {
      if (b.type === "text" && b.text.trim()) transcript.push({ text: b.text });
    }
    messages.push({ role: "assistant", content: final.content });

    if (final.stop_reason !== "tool_use") {
      if (final.stop_reason !== "end_turn") transcript.push({ note: `stop_reason: ${final.stop_reason}` });
      return;
    }
    const results = [];
    for (const b of final.content) {
      if (b.type !== "tool_use") continue;
      let value;
      let isError = false;
      try {
        value = runTool(store, b.name, b.input);
      } catch (e) {
        value = { error: e.message };
        isError = true;
      }
      transcript.push({ tool: b.name, input: b.input, error: isError || undefined, result: JSON.stringify(value).slice(0, 2500) });
      record.tools[b.name] = (record.tools[b.name] ?? 0) + 1;
      if (b.name === "request_deep_planning" && route === "chat") route = "deep";
      results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(value) });
    }
    messages.push({ role: "user", content: results });
  }
}

function runKey(s, arm, rep) {
  return `${s.id}__${arm}__r${rep}`;
}

async function runOne(client, scenario, arm, rep) {
  const key = runKey(scenario, arm, rep);
  const file = path.join(RUNS, `${key}.json`);
  if (fs.existsSync(file)) {
    const prior = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!prior.error) return;
  }
  const store = { ...FIXTURES[scenario.fixture](), created: {}, finalized: false };
  const armCfg = ARMS[arm];
  const record = {
    key,
    scenario: scenario.id,
    arm,
    rep,
    cost: 0,
    apiCalls: 0,
    usage: {},
    tools: {},
    modelsUsed: {},
    transcript: [],
  };
  const ctx = { armCfg, scenario, tools: toolsFor(store, arm, scenario), store, record };
  const messages = [];
  record.context = contextFor(store, arm, scenario, { firstTurn: true });
  const startedAt = Date.now();
  try {
    for (const h of scenario.history ?? []) {
      messages.push({ role: "user", content: [{ type: "text", text: `${contextFor(store, arm, scenario, { firstTurn: true })}\n\n${h.user}` }] });
      messages.push({ role: "assistant", content: [{ type: "text", text: h.assistant }] });
      record.transcript.push({ human: h.user }, { text: h.assistant, fixed: true });
    }
    let msg = scenario.user;
    let first = true;
    const replies = [...(scenario.replies ?? [])];
    while (true) {
      messages.push({ role: "user", content: [{ type: "text", text: `${contextFor(store, arm, scenario, { firstTurn: first })}\n\n${msg}` }] });
      record.transcript.push({ human: msg });
      const compacted = [...compactOlder(messages)];
      messages.length = 0;
      messages.push(...compacted);
      await runTurn(client, ctx, messages, record.transcript);
      first = false;
      if (scenario.singleTurn || !scenario.replies || store.finalized || replies.length === 0) break;
      msg = replies.shift();
    }
  } catch (e) {
    if (e instanceof BudgetExceeded) {
      log(`BUDGET reached, stopping ${key}`);
      // The partial run isn't kept, but what it spent still counts.
      fs.writeFileSync(path.join(ABORTED, `${key}.json`), JSON.stringify({ key, cost: record.cost }));
      return "budget";
    }
    record.error = e.message;
  }
  record.seconds = Math.round((Date.now() - startedAt) / 1000);
  record.finalPlan =
    scenario.route === "build"
      ? store.workouts.map((w) => ({ date: w.date, day: dayName(w.date), type: w.type, notes: w.notes }))
      : undefined;
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  log(`${key} $${record.cost.toFixed(3)} total=$${liveSpend.toFixed(2)} tools=${JSON.stringify(record.tools)}${record.error ? " ERROR " + record.error : ""}`);
}

async function pool(jobs, n) {
  let i = 0;
  let stop = false;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < jobs.length && !stop) {
        const job = jobs[i++];
        if ((await job()) === "budget") stop = true;
      }
    })
  );
}

// ---------- Blind judging ----------

function visible(run) {
  const lines = [`CONTEXT THE COACH WAS GIVEN AT THE START OF THE TURN\n${run.context ?? ""}\n\nCONVERSATION`];
  for (const t of run.transcript) {
    if (t.human) lines.push(`ATHLETE: ${t.human.replace(/<!--.*?-->/g, "").trim()}`);
    else if (t.text) lines.push(`${t.fixed ? "COACH (earlier reply)" : "COACH"}: ${t.text}`);
    else if (t.tool) {
      const summary =
        t.tool === "update_workouts"
          ? (t.input.operations ?? [])
              .map((o) => `${o.date} ${o.op} ${o.workout?.type ?? ""} ${o.workout?.distance_km ?? ""}km ${o.workout?.notes ?? ""}`)
              .join("\n  ")
          : JSON.stringify(t.input).slice(0, 400);
      lines.push(`[tool call: ${t.tool}]\n  ${summary}\n  result: ${t.result ?? ""}`);
    } else if (t.note) lines.push(`[${t.note}]`);
  }
  return lines.join("\n\n");
}

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "partial", "fail"] },
    coaching_quality: { type: "integer", description: "1 (poor) to 5 (excellent): the quality of the coaching judgment." },
    reason: { type: "string", description: "Two sentences at most, citing what the coach did." },
  },
  required: ["verdict", "coaching_quality", "reason"],
  additionalProperties: false,
};

async function judgeOne(client, key, rubric, transcriptText) {
  const file = path.join(JUDGED, `${key}.json`);
  if (fs.existsSync(file)) return;
  if (liveSpend >= BUDGET) return "budget";
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 6000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    system:
      "You grade replies from an AI endurance coach against a rubric. The transcript shows the context the coach was given, its replies, and the tool calls it actually made with their results (long results are cut off). Facts that appear in the context or tool results are known to the coach, so don't treat them as invented. A claim that the plan changed is true only if an update_workouts call appears. Apply the rubric strictly, and be alert to errors of fact against the context, tool results and supplied facts.",
    messages: [{ role: "user", content: `RUBRIC\n${rubric}\n\nTRANSCRIPT\n${transcriptText.slice(0, 120000)}` }],
  });
  const c = cost("claude-opus-5-5", response.usage);
  liveSpend += c;
  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text);
  const arm = key.split("__")[1];
  fs.writeFileSync(file, JSON.stringify({ key, arm, ...parsed, cost: c }, null, 2));
  log(`judged ${key}: ${parsed.verdict}`);
}

function loadRuns() {
  return fs.readdirSync(RUNS).map((f) => JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8")));
}

async function judgeAll(client) {
  const runs = loadRuns();
  const byId = Object.fromEntries(runs.map((r) => [r.key, r]));
  const jobs = [];
  for (const run of runs) {
    const s = SCENARIOS.find((x) => x.id === run.scenario);
    if (s.pair) continue;
    jobs.push(() => judgeOne(client, run.key, s.rubric, visible(run)));
  }
  for (const [pair, rubric] of Object.entries(PAIR_RUBRIC)) {
    const members = SCENARIOS.filter((s) => s.pair === pair);
    for (const arm of CHAT_ARMS) {
      for (const rep of [0, 1, 2]) {
        const a = byId[runKey(members[0], arm, rep)];
        const b = byId[runKey(members[1], arm, rep)];
        if (!a || !b) continue;
        jobs.push(() =>
          judgeOne(client, `${pair}__${arm}__r${rep}`, rubric, `REPLY A\n${visible(a)}\n\n---\n\nREPLY B\n${visible(b)}`)
        );
      }
    }
  }
  await pool(jobs, CONCURRENCY);
}

// ---------- Report ----------

function report() {
  const runs = loadRuns();
  const judged = fs.readdirSync(JUDGED).map((f) => JSON.parse(fs.readFileSync(path.join(JUDGED, f), "utf8")));
  const ids = [...SCENARIOS.filter((s) => !s.pair).map((s) => s.id), "s6"].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const sym = { pass: "P", partial: "~", fail: "F" };
  const lines = ["# Results", "", `| Scenario | ${CHAT_ARMS.join(" | ")} |`, `|---|${CHAT_ARMS.map(() => "---").join("|")}|`];
  for (const id of ids) {
    const cells = CHAT_ARMS.map((arm) => {
      const js = judged.filter((j) => j.arm === arm && j.key.startsWith(`${id}__`));
      return js.length ? js.map((j) => `${sym[j.verdict]}${j.coaching_quality}`).join(" ") : "-";
    });
    lines.push(`| ${id} | ${cells.join(" | ")} |`);
  }
  lines.push("", "| Configuration | Pass | Partial | Fail | Avg quality | Avg cost per run |", "|---|---|---|---|---|---|");
  const buildIds = SCENARIOS.filter((s) => s.route === "build").map((s) => s.id);
  const isBuildKey = (key) => buildIds.some((id) => key.startsWith(`${id}__`));
  for (const arm of CHAT_ARMS) {
    const js = judged.filter((j) => j.arm === arm && !isBuildKey(j.key));
    const armRuns = runs.filter((r) => r.arm === arm && !buildIds.includes(r.scenario));
    const n = (v) => js.filter((j) => j.verdict === v).length;
    const q = js.reduce((s, j) => s + j.coaching_quality, 0) / (js.length || 1);
    const c = armRuns.reduce((s, r) => s + r.cost, 0) / (armRuns.length || 1);
    lines.push(`| ${arm} | ${n("pass")} | ${n("partial")} | ${n("fail")} | ${q.toFixed(2)} | $${c.toFixed(3)} |`);
  }

  // Objective behavior, independent of the grader.
  const noWrite = ["s1-", "s4-", "s6a", "s6b", "s7-", "s7b", "s8-", "s10", "s12", "s13", "s14"];
  const claim = /(I['’]ve|I have) (made|updated|changed|swapped|moved|written|replaced)|has been updated/i;
  lines.push("", "## Objective behavior (chat)", "", "| Configuration | Runs | Wrote without being asked | Claimed a change with no write | 400s written on first ask (s1) | Errors or cutoffs | Avg output tokens |", "|---|---|---|---|---|---|---|");
  for (const arm of CHAT_ARMS) {
    const rs = runs.filter((r) => r.arm === arm && !buildIds.includes(r.scenario));
    const unasked = rs.filter((r) => noWrite.some((p) => r.scenario.startsWith(p)) && r.tools.update_workouts);
    const claims = rs.filter((r) => !r.tools.update_workouts && claim.test(r.transcript.filter((t) => t.text && !t.fixed).map((t) => t.text).join(" ")));
    const s1 = rs.filter((r) => r.scenario === "s1-poor-timing");
    const s1w = s1.filter((r) => r.transcript.some((t) => t.tool === "update_workouts" && (t.input.operations ?? []).some((o) => o.date === "2026-11-04")));
    const bad = rs.filter((r) => r.error || r.transcript.some((t) => t.note));
    const tok = rs.reduce((s, r) => s + (r.usage.output_tokens ?? 0), 0) / (rs.length || 1);
    lines.push(`| ${arm} | ${rs.length} | ${unasked.length} | ${claims.length} | ${s1w.length}/${s1.length} | ${bad.length} | ${Math.round(tok)} |`);
  }
  lines.push("", "## Plan builds", "", "| Run | Verdict | API calls | Week writes | Largest possible output | Finalized | Cost |", "|---|---|---|---|---|---|---|");
  for (const r of runs.filter((r) => buildIds.includes(r.scenario)).sort((a, b) => a.key.localeCompare(b.key))) {
    const j = judged.find((x) => x.key === r.key);
    const notes = r.transcript.filter((t) => t.note).map((t) => t.note).join("; ");
    lines.push(`| ${r.key} | ${j ? `${j.verdict}/${j.coaching_quality}` : "-"} | ${r.apiCalls} | ${r.tools.update_workouts ?? 0} | ${notes || r.error || "ok"} | ${r.tools.finalize_plan ? "yes" : "no"} | $${r.cost.toFixed(2)} |`);
  }
  lines.push("", "## Objective checks", "", "| Run | Tools | Models | Cost |", "|---|---|---|---|");
  for (const r of runs.sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(`| ${r.key} | ${JSON.stringify(r.tools)} | ${JSON.stringify(r.modelsUsed)} | $${r.cost.toFixed(3)} |`);
  }
  lines.push("", `Total runs: ${runs.length}. Total spend: $${spentSoFar().toFixed(2)}.`, "", "## Judge reasons", "");
  for (const j of judged.sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(`- **${j.key}** ${j.verdict}/${j.coaching_quality}: ${j.reason}`);
  }
  fs.writeFileSync(path.join(OUT, "summary.md"), lines.join("\n"));

  const t = ["# Transcripts", ""];
  for (const r of runs.sort((a, b) => a.key.localeCompare(b.key))) {
    t.push(`## ${r.key} ($${r.cost.toFixed(3)})`, "", visible(r), "");
    if (r.finalPlan?.length) {
      t.push("### Quality sessions in the plan", "");
      for (const w of r.finalPlan.filter((w) => !["easy", "recovery", "rest"].includes(w.type))) {
        t.push(`- ${w.date} ${w.day} ${w.type}: ${w.notes}`);
      }
      t.push("");
    }
  }
  fs.writeFileSync(path.join(OUT, "transcripts.md"), t.join("\n"));
  log(`report written, spend $${spentSoFar().toFixed(2)}`);
}

// ---------- Entry ----------

it("coach eval", async () => {
  liveSpend = spentSoFar();
  log(`mode=${MODE} budget=$${BUDGET} already spent=$${liveSpend.toFixed(2)}`);
  if (MODE === "report") return report();
  if (MODE === "dry") {
    // Free: renders every scenario's context and tools without calling the API.
    for (const s of SCENARIOS) {
      for (const arm of s.route === "build" ? BUILD_ARMS : CHAT_ARMS) {
        const store = { ...FIXTURES[s.fixture](), created: {}, finalized: false };
        const context = contextFor(store, arm, s, { firstTurn: true });
        const tools = toolsFor(store, arm, s);
        log(`dry ${s.id} ${arm}: context ${context.length} chars, ${tools.length} tools, ${store.workouts.length} workouts, ${store.activities.length} activities`);
        if (s.id === "s7-repeated-shape" && (arm === "old-sonnet5" || arm === "new-sonnet5")) {
          fs.writeFileSync(path.join(OUT, `dry-context-${arm}.txt`), context);
        }
      }
    }
    return;
  }
  const client = getClient();
  if (MODE === "judge") {
    await judgeAll(client);
    return report();
  }
  const chat = SCENARIOS.filter((s) => s.route === "chat" && !s.retestOnly);
  const builds = SCENARIOS.filter((s) => s.route === "build");
  const job = (s, arm, rep) => () => runOne(client, s, arm, rep);
  if (MODE === "retest-build") {
    // Re-checks the long build after the wording fix, as a separate sample.
    const s = SCENARIOS.find((x) => x.id === "s15-long-build");
    await runOne(client, s, "new-opus55", 1);
    const file = path.join(RUNS, `${runKey(s, "new-opus55", 1)}.json`);
    if (fs.existsSync(file)) {
      await judgeOne(client, runKey(s, "new-opus55", 1), s.rubric, visible(JSON.parse(fs.readFileSync(file, "utf8"))));
    }
    return report();
  }
  if (MODE === "retest") {
    // Targeted checks after the prompt fixes. Leaves summary.md as the record of the main run.
    const clean = SCENARIOS.find((s) => s.id === "s7b-repeated-shape-clean");
    const s1 = SCENARIOS.find((s) => s.id === "s1-poor-timing");
    const targets = [
      [clean, "old-sonnet5", 0],
      [clean, "new-sonnet5", 0],
      [clean, "new-sonnet55", 0],
      [clean, "new-opus55", 0],
      [s1, "new-opus55", 2],
    ];
    await pool(targets.map(([s, a, r]) => job(s, a, r)), CONCURRENCY);
    await pool(
      targets.map(([s, a, r]) => async () => {
        const key = runKey(s, a, r);
        const file = path.join(RUNS, `${key}.json`);
        if (!fs.existsSync(file)) return;
        return judgeOne(client, key, s.rubric, visible(JSON.parse(fs.readFileSync(file, "utf8"))));
      }),
      CONCURRENCY
    );
    log(`retest done, spend $${liveSpend.toFixed(2)}`);
    return;
  }
  if (MODE === "smoke") {
    const s = chat[0];
    await pool([job(s, "old-sonnet5", 0), job(s, "new-sonnet5", 0)], 2);
    return;
  }
  // Sized to a fixed total budget, most decision-relevant work first: every setup
  // once, the builds that answer a question, then a second sample where setups differ.
  await pool(chat.flatMap((s) => CHAT_ARMS.map((a) => job(s, a, 0))), CONCURRENCY);
  log(`chat pass 1 done, spend $${liveSpend.toFixed(2)}`);
  const byId = (id) => SCENARIOS.find((s) => s.id === id);
  const buildJobs = [
    ["s9-plan-build", "old-opus55"],
    ["s9-plan-build", "new-opus55"],
    ["s9-plan-build", "new-opus55-xhigh"],
    ["s11-returner", "old-opus55"],
    ["s11-returner", "new-opus55"],
    ["s15-long-build", "new-opus55"],
  ];
  await pool(buildJobs.map(([id, a]) => job(byId(id), a, 0)), 3);
  log(`builds done, spend $${liveSpend.toFixed(2)}`);
  const differing = ["s1-poor-timing", "s3-pushes-hard", "s4-pressure-only", "s5-new-evidence", "s7b-repeated-shape-clean", "s14-cyclist"];
  await pool(differing.flatMap((id) => CHAT_ARMS.filter((a) => a !== "old-opus55").map((a) => job(byId(id), a, 1))), CONCURRENCY);
  log(`runs done, spend $${liveSpend.toFixed(2)}`);
});
