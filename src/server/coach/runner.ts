import { eq, and, sql, count } from "drizzle-orm";
import { db } from "@/server/db";
import { users, plans, workouts } from "@/server/db/schema";
import {
  getAnthropic,
  COACH_MODEL,
  COACH_BUILD_MODEL,
  COACH_DEEP_MODEL,
  COACH_BUILD_EFFORT,
  COACH_DEEP_EFFORT,
  COACH_CHAT_MAX_TOKENS,
  COACH_BUILD_MAX_TOKENS,
} from "./anthropic";
import { COACH_SYSTEM_PROMPT } from "./system-prompt";
import { renderContextPrefix, RECENT_TRAINING_OPEN, RECENT_TRAINING_CLOSE } from "./context";
import { routeLabel } from "@/lib/route-label";
import { loadHistory, appendMessage } from "./messages";
import { getTools, getColdStartTools, HANDLERS, summarizeToolResult } from "./tools/index";
import { fetchRecentTraining, renderRecentTraining } from "./recent-training";
import type { SSEEvent, ToolName, ContentBlock } from "./types";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { StravaPreload } from "./strava-preload";

const KNOWN_TOOLS = new Set([
  "get_active_plan",
  "list_plans",
  "get_plan",
  "create_plan",
  "update_workouts",
  "set_active_plan",
  "archive_plan",
  "finalize_plan",
  "get_recent_activities",
  "get_activity_laps",
  "update_activity_match",
  "get_athlete_summary",
  "update_coach_notes",
  "update_plan_notes",
  "read_uploaded_file",
  "request_deep_planning",
]);

const DEEP_PLANNING_TOOL = "request_deep_planning";

// Block types the Anthropic API accepts from us. Built-in/server tools like
// code_execution use non-standard types (e.g. "server_tool_use" with IDs
// prefixed "srvtoolu_") that we must strip before sending history back.
const ALLOWED_BLOCK_TYPES = new Set([
  "text",
  "tool_use",
  "tool_result",
  "image",
  "document",
  "thinking",
  "redacted_thinking",
]);

// One-hour cache entries. Coach conversations are human-paced — the athlete
// replies minutes to hours later — so the default 5-minute TTL was almost
// always cold by the next message and the whole history was re-billed at full
// price. The 1h write costs 2x (vs 1.25x) and pays for itself on the first
// prevented miss.
const CACHE_1H = { type: "ephemeral", ttl: "1h" } as const;

/**
 * Strip tool_use/tool_result pairs for tools not in our known set, plus any
 * non-standard block types (e.g. "server_tool_use" from built-in code_execution).
 * The API rejects any tool_use that lacks a matching result block.
 */
function stripUnknownToolBlocks(msgs: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const unknownIds = new Set<string>();
  for (const m of msgs) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      const block = b as { type: string; id?: string; name?: string };
      if (block.type === "tool_use" && block.id && block.name && !KNOWN_TOOLS.has(block.name)) {
        unknownIds.add(block.id);
      }
      if (!ALLOWED_BLOCK_TYPES.has(block.type) && block.id) {
        unknownIds.add(block.id);
      }
    }
  }

  return msgs
    .map((m) => {
      if (!Array.isArray(m.content)) return m;
      const content = m.content.filter((b) => {
        const block = b as { type: string; id?: string; tool_use_id?: string };
        if (!ALLOWED_BLOCK_TYPES.has(block.type)) return false;
        if (block.type === "tool_use" && block.id && unknownIds.has(block.id)) return false;
        if (block.type === "tool_result" && block.tool_use_id && unknownIds.has(block.tool_use_id))
          return false;
        return true;
      });
      if (content.length === m.content.length) return m;
      return { ...m, content };
    })
    .filter((m) => !Array.isArray(m.content) || m.content.length > 0);
}

/**
 * Remove broken tool_use/tool_result pairs anywhere in history (not just at the
 * tail). A handler crash can leave an assistant turn with tool_use blocks but no
 * following user turn with tool_result blocks — the Anthropic API rejects this
 * even when the broken pair is buried mid-conversation.
 */
function sanitizeMessages(msgs: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let i = 0;
  while (i < msgs.length) {
    const m = msgs[i];
    const content = Array.isArray(m.content) ? m.content : [];

    if (m.role === "assistant") {
      const toolUseIds = content
        .filter((b) => (b as { type: string }).type === "tool_use")
        .map((b) => (b as { type: string; id: string }).id);

      if (toolUseIds.length > 0) {
        const next = msgs[i + 1];
        const nextContent = next && Array.isArray(next.content) ? next.content : [];
        const resultIds = new Set(
          nextContent
            .filter((b) => (b as { type: string }).type === "tool_result")
            .map((b) => (b as { type: string; tool_use_id: string }).tool_use_id)
        );
        const allAccountedFor = toolUseIds.every((id) => resultIds.has(id));

        if (!allAccountedFor) {
          i++;
          if (
            next &&
            next.role === "user" &&
            nextContent.length > 0 &&
            nextContent.every((b) => (b as { type: string }).type === "tool_result")
          ) {
            i++;
          }
          continue;
        }
      }
    }

    if (m.role === "user") {
      const hasToolResult = content.some((b) => (b as { type: string }).type === "tool_result");
      if (hasToolResult) {
        const prev = out[out.length - 1];
        const prevContent = prev && Array.isArray(prev.content) ? prev.content : [];
        const prevHasToolUse = prevContent.some((b) => (b as { type: string }).type === "tool_use");
        if (!prevHasToolUse) {
          i++;
          continue;
        }
      }
    }

    out.push(m);
    i++;
  }
  return out;
}

/** A "human" turn: a user message carrying at least one text block (not just tool results). */
function isHumanMessage(m: Anthropic.MessageParam): boolean {
  if (m.role !== "user") return false;
  if (typeof m.content === "string") return true;
  return m.content.some((b) => (b as { type: string }).type === "text");
}

function lastHumanIndex(msgs: Anthropic.MessageParam[]): number {
  for (let i = msgs.length - 1; i >= 0; i--) if (isHumanMessage(msgs[i])) return i;
  return -1;
}

const TOOL_CONTENT_LIMIT = 3000;
const RECENT_TRAINING_ELIDED = `${RECENT_TRAINING_OPEN}(elided — superseded by the latest message)${RECENT_TRAINING_CLOSE}`;
const RECENT_TRAINING_RE = new RegExp(
  `${RECENT_TRAINING_OPEN}[\\s\\S]*?${RECENT_TRAINING_CLOSE}`,
  "g"
);

/**
 * Shrink history that precedes the current human message:
 *  - large tool_use inputs / tool_result payloads are truncated (the model
 *    doesn't need the full JSON of a plan read from three turns ago), and
 *  - stale planned-vs-actual blocks are elided (the latest message carries a
 *    fresh one).
 *
 * The boundary is the last human message rather than a sliding "last N
 * messages" window: a sliding window rewrites a different message every turn,
 * which broke the prompt cache at that point on every request. With this rule,
 * a given message is rewritten exactly once (when the next human turn arrives)
 * and is byte-stable afterwards.
 */
function compactOlderHistory(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const boundary = lastHumanIndex(messages);
  if (boundary <= 0) return messages;
  return messages.map((m, i) => {
    if (i >= boundary) return m;
    if (!Array.isArray(m.content)) return m;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = m.content.map((block: any) => {
      if (block.type === "tool_result") {
        const text =
          typeof block.content === "string" ? block.content : JSON.stringify(block.content);
        if (text.length <= TOOL_CONTENT_LIMIT) return block;
        return { ...block, content: text.slice(0, TOOL_CONTENT_LIMIT) + "…[truncated]" };
      }
      if (block.type === "tool_use") {
        const text = JSON.stringify(block.input);
        if (text.length <= TOOL_CONTENT_LIMIT) return block;
        return { ...block, input: { _truncated: text.slice(0, TOOL_CONTENT_LIMIT) + "…" } };
      }
      if (block.type === "text" && m.role === "user" && typeof block.text === "string") {
        if (!block.text.includes(RECENT_TRAINING_OPEN)) return block;
        return { ...block, text: block.text.replace(RECENT_TRAINING_RE, RECENT_TRAINING_ELIDED) };
      }
      return block;
    });
    return { ...m, content } as Anthropic.MessageParam;
  });
}

/**
 * Mark the second-to-last message's last content block as a cache breakpoint.
 * Anthropic caches all tokens up to and including this block, so repeated API
 * calls within an agentic loop (and across consecutive turns) don't re-charge
 * the stable history. We already cache the system prompt; this covers the rest.
 */
function withCacheBreakpoint(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length < 2) return messages;
  const out = messages.map((m) => ({ ...m }));
  const target = out[out.length - 2];
  const content = Array.isArray(target.content)
    ? [...target.content]
    : [{ type: "text" as const, text: target.content as string }];
  if (content.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const last = content[content.length - 1] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content[content.length - 1] = { ...last, cache_control: CACHE_1H } as any;
    out[out.length - 2] = { ...target, content };
  }
  return out;
}

/**
 * True when the previous human turn escalated to deep planning: the coach
 * called `request_deep_planning` somewhere between the previous human message
 * and the current one. The escalation covers "the rest of this turn and the
 * athlete's next turn", so the next turn is detected here from history.
 */
function deepPlanningCarriedOver(messages: Anthropic.MessageParam[]): boolean {
  const last = lastHumanIndex(messages);
  if (last <= 0) return false;
  let prev = -1;
  for (let i = last - 1; i >= 0; i--) {
    if (isHumanMessage(messages[i])) {
      prev = i;
      break;
    }
  }
  if (prev < 0) return false;
  for (let i = prev + 1; i < last; i++) {
    const m = messages[i];
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    for (const b of m.content) {
      const block = b as { type: string; name?: string };
      if (block.type === "tool_use" && block.name === DEEP_PLANNING_TOOL) return true;
    }
  }
  return false;
}

type Route = "chat" | "build" | "deep";

function routeConfig(route: Route): {
  model: string;
  max_tokens: number;
  effort: "high" | null;
} {
  switch (route) {
    case "build":
      return {
        model: COACH_BUILD_MODEL,
        max_tokens: COACH_BUILD_MAX_TOKENS,
        effort: COACH_BUILD_EFFORT,
      };
    case "deep":
      return {
        model: COACH_DEEP_MODEL,
        max_tokens: COACH_BUILD_MAX_TOKENS,
        effort: COACH_DEEP_EFFORT,
      };
    default:
      return { model: COACH_MODEL, max_tokens: COACH_CHAT_MAX_TOKENS, effort: null };
  }
}

export interface RunInput {
  userId: string;
  message: string;
  planId?: string | null;
  fromRoute?: string;
  /** Free-text detail about where the athlete came from, e.g. the workout they tapped. */
  fromLabel?: string;
  planFileId?: string;
  today: string; // YYYY-MM-DD
  stravaPreload?: StravaPreload | null;
  coldStartBuild?: boolean;
}

export async function* runCoach(input: RunInput): AsyncGenerator<SSEEvent> {
  const { userId, message, fromRoute, fromLabel, planFileId, today } = input;
  const planId: string | null = input.planId ?? null;

  // Detect whether this turn is part of a build flow. The caller may pass
  // coldStartBuild=true (initial build form submission), or this can be a
  // continuation turn for a plan still in 'generating' status (clarifying-question
  // replies routed via /api/coach/chat for the same plan).
  let coldStartBuild = input.coldStartBuild ?? false;
  if (!coldStartBuild && planId) {
    const [planRow] = await db
      .select({ status: plans.generation_status })
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
      .limit(1);
    if (planRow?.status === "generating") {
      coldStartBuild = true;
    }
  }

  // Hoisted so the finally block can auto-finalize even if the streaming loop
  // throws partway through a cold-start build.
  const createdPlanIds: string[] = [];
  const finalizedPlanIds = new Set<string>();

  try {
    // 1. Load user context (units + coach_notes + active plan summary)
    const [userRow] = await db
      .select({
        units: users.preferences,
        coach_notes: users.coach_notes,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow) throw new Error("User not found");

    const units = (userRow.units as { units?: string })?.units === "km" ? "km" : "mi";
    const coachNotes = userRow.coach_notes ?? "";

    // Active plan summary
    const activePlanRows = await db
      .select({
        id: plans.id,
        title: plans.title,
        mode: plans.mode,
        sport: plans.sport,
        end_date: plans.end_date,
      })
      .from(plans)
      .where(and(eq(plans.userId, userId), eq(plans.is_active, true)))
      .limit(1);

    const activePlan = activePlanRows[0] ?? null;

    let activePlanSummary: {
      title: string;
      weeks_left: number | null;
      workout_count: number;
      completed: number;
    } | null = null;

    if (activePlan) {
      const [workoutCounts] = await db
        .select({
          total: count(),
          completed: sql<number>`count(*) filter (where ${workouts.date} < ${today})`,
        })
        .from(workouts)
        .where(eq(workouts.plan_id, activePlan.id));

      const weeksLeft =
        activePlan.mode === "goal" && activePlan.end_date
          ? Math.max(
              0,
              Math.round(
                (new Date(activePlan.end_date).getTime() - new Date(today).getTime()) /
                  (7 * 24 * 60 * 60 * 1000)
              )
            )
          : null;

      activePlanSummary = {
        title: activePlan.title,
        weeks_left: weeksLeft,
        workout_count: Number(workoutCounts?.total ?? 0),
        completed: Number(workoutCounts?.completed ?? 0),
      };
    }

    // Plan-specific coach notes + sport (for the planned-vs-actual block)
    let planCoachNotes = "";
    let conversationPlan: { id: string; sport: "run" | "bike" } | null = null;
    if (planId) {
      const [planRow] = await db
        .select({ coach_notes: plans.coach_notes, sport: plans.sport })
        .from(plans)
        .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
        .limit(1);
      planCoachNotes = planRow?.coach_notes ?? "";
      if (planRow) conversationPlan = { id: planId, sport: planRow.sport };
    } else if (activePlan) {
      conversationPlan = { id: activePlan.id, sport: activePlan.sport };
    }

    // Planned vs actual for the last 14 days (+ next 7 planned). Skipped during
    // cold-start builds — the plan is still empty and the Strava preload covers it.
    let recentTraining: string | null = null;
    if (!coldStartBuild && conversationPlan) {
      try {
        const rt = await fetchRecentTraining({
          userId,
          planId: conversationPlan.id,
          sport: conversationPlan.sport,
          today,
        });
        recentTraining = renderRecentTraining(rt, units);
      } catch (err) {
        console.error("recent training fetch failed", err);
      }
    }

    let planFileSummary: {
      id: string;
      original_filename: string;
      status: "extracting" | "extracted" | "failed";
      extraction_error: string | null;
    } | null = null;
    if (planFileId) {
      const { getPlanFileById } = await import("@/server/plans/files");
      const f = await getPlanFileById(planFileId, userId);
      if (f) {
        planFileSummary = {
          id: f.id,
          original_filename: f.original_filename,
          status: f.status,
          extraction_error: f.extraction_error,
        };
      }
    }

    // 2. Decide the route before rendering context (the prefix mentions carried-over deep mode).
    const priorHistory = await loadHistory(userId, planId);
    const priorMessages: Anthropic.MessageParam[] = priorHistory.map((m) => ({
      role: m.role,
      content: m.content as Anthropic.ContentBlockParam[],
    }));
    // The current human message hasn't been appended yet, so the "previous
    // turn" is everything after the last human message in prior history.
    const carriedOver =
      !coldStartBuild &&
      deepPlanningCarriedOver([
        ...priorMessages,
        { role: "user", content: [{ type: "text", text: "" }] },
      ]);

    let route: Route = coldStartBuild ? "build" : carriedOver ? "deep" : "chat";

    // 3. Build context prefix
    const contextPrefix = renderContextPrefix({
      today,
      units,
      activePlan: activePlanSummary,
      coachNotes,
      planCoachNotes,
      fromLabel: routeLabel(fromRoute),
      fromDetail: fromLabel ?? null,
      planFile: planFileSummary,
      stravaPreload: input.stravaPreload ?? null,
      coldStartBuild,
      coldStartPlanId: coldStartBuild ? planId : null,
      recentTraining,
      deepPlanning: route === "deep",
    });

    // 4. Persist user message
    await appendMessage(
      userId,
      "user",
      [{ type: "text", text: `${contextPrefix}\n\n${message}` }],
      planId
    );

    // 5. Reload full history
    const history = await loadHistory(userId, planId);

    const rawMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role,
      content: m.content as Anthropic.ContentBlockParam[],
    }));
    const anthropicMessages = compactOlderHistory(
      sanitizeMessages(stripUnknownToolBlocks(rawMessages))
    );

    // 6. Call Anthropic SDK with streaming
    const client = getAnthropic();

    // System prompt with cache_control at end (1h TTL; see CACHE_1H).
    const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
      {
        type: "text",
        text: COACH_SYSTEM_PROMPT,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cache_control: CACHE_1H as any,
      },
    ];

    const tools = coldStartBuild ? getColdStartTools(planId) : getTools(planId);

    let currentMessages = [...anthropicMessages];
    let assistantMessageId = "";
    let apiCalls = 0;

    while (true) {
      const cfg = routeConfig(route);
      apiCalls++;

      const stream = client.messages.stream({
        model: cfg.model,
        max_tokens: cfg.max_tokens,
        // Adaptive thinking on every route. Sonnet 5 / Opus 5 accept this as
        // the only "on" mode; Opus 5 would think by default anyway. Effort
        // is pinned per route (a mid-conversation effort change breaks the
        // messages cache) — chat leaves it at the model default.
        thinking: { type: "adaptive" },
        ...(cfg.effort ? { output_config: { effort: cfg.effort } } : {}),
        system: systemBlocks,
        tools,
        messages: withCacheBreakpoint(currentMessages),
      });

      // Track tool use blocks being built: index -> partial block
      const toolUseMap = new Map<number, { id: string; name: string; inputJson: string }>();

      let stopReason: string | null = null;

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "tool_use") {
            toolUseMap.set(event.index, {
              id: block.id,
              name: block.name,
              inputJson: "",
            });
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            yield { type: "text-delta", delta: delta.text };
          } else if (delta.type === "input_json_delta") {
            const entry = toolUseMap.get(event.index);
            if (entry) {
              entry.inputJson += delta.partial_json;
            }
          }
          // thinking_delta / signature_delta: not surfaced; the final message
          // carries the complete blocks and they're persisted from there.
        } else if (event.type === "message_delta") {
          stopReason = event.delta.stop_reason ?? null;
        }
      }

      const finalMsg = await stream.finalMessage();

      // Usage logging — the only ground truth for cost and cache health.
      // cache_read_input_tokens should dominate input_tokens on a warm loop.
      const usage = (finalMsg.usage ?? {}) as unknown as Record<string, unknown>;
      console.log(
        JSON.stringify({
          evt: "coach_usage",
          model: finalMsg.model ?? cfg.model,
          route,
          call: apiCalls,
          plan_id: planId,
          cold_start: coldStartBuild,
          stop_reason: finalMsg.stop_reason,
          input_tokens: usage.input_tokens ?? 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          output_tokens: usage.output_tokens ?? 0,
        })
      );

      // Build turn blocks from final message content (authoritative). Thinking
      // blocks are kept — they must be replayed unchanged on later requests
      // (the API drops what a different model can't read, unbilled).
      const finalTurnBlocks: ContentBlock[] = finalMsg.content.map((block) => {
        if (block.type === "text") {
          return { type: "text", text: block.text };
        } else if (block.type === "tool_use") {
          return {
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
        return block as ContentBlock;
      });

      const effectiveStopReason = stopReason ?? finalMsg.stop_reason;

      if (effectiveStopReason === "max_tokens") {
        throw new Error(
          "Response was too long to complete. Try asking for a smaller change (e.g. one week at a time)."
        );
      }

      if (effectiveStopReason === "refusal") {
        throw new Error(
          "The coach declined to answer that request. Try rephrasing or narrowing it."
        );
      }

      if (effectiveStopReason !== "tool_use") {
        // Final turn — persist assistant message
        const storedMsg = await appendMessage(userId, "assistant", finalTurnBlocks, planId);
        assistantMessageId = storedMsg.id;
        break;
      }

      // Tool use turn — process tools
      const toolUseBlocks = finalTurnBlocks.filter((b) => b.type === "tool_use") as {
        type: "tool_use";
        id: string;
        name: string;
        input: unknown;
      }[];

      // Persist intermediate assistant turn (with tool_use blocks) so history stays valid
      await appendMessage(userId, "assistant", finalTurnBlocks as ContentBlock[], planId);

      currentMessages = [
        ...currentMessages,
        { role: "assistant" as const, content: finalTurnBlocks as Anthropic.ContentBlockParam[] },
      ];

      const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        const toolName = toolBlock.name as ToolName;
        const handler = HANDLERS[toolName];

        yield { type: "tool-use", name: toolName, input: toolBlock.input };

        let resultValue: unknown;

        try {
          if (handler) {
            resultValue = await handler(toolBlock.input, {
              userId,
              planId,
              coldStartBuild,
              today,
            });
          } else {
            resultValue = { error: `Unknown tool: ${toolName}` };
          }
        } catch (err) {
          // Convert handler errors to error result so the tool_result is always
          // persisted and history stays valid for subsequent requests.
          resultValue = { error: err instanceof Error ? err.message : String(err) };
        }
        const resultText = JSON.stringify(resultValue);

        if (toolName === "create_plan") {
          const created = resultValue as { plan_id?: string } | null;
          if (created?.plan_id) createdPlanIds.push(created.plan_id);
        } else if (toolName === "finalize_plan") {
          const inp = toolBlock.input as { plan_id?: string } | null;
          if (inp?.plan_id) finalizedPlanIds.add(inp.plan_id);
        } else if (toolName === DEEP_PLANNING_TOOL && route === "chat") {
          // Rest of this turn runs on the deep model. The next human turn is
          // picked up from history by deepPlanningCarriedOver().
          route = "deep";
        }

        const summary =
          handler != null
            ? summarizeToolResult(toolName, resultValue)
            : `Unknown tool: ${toolName}`;

        yield { type: "tool-result", name: toolName, result_summary: summary };

        toolResultContent.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: resultText,
        });
      }

      // Persist tool results as a user turn so history stays valid across requests
      await appendMessage(userId, "user", toolResultContent as ContentBlock[], planId);

      currentMessages = [...currentMessages, { role: "user" as const, content: toolResultContent }];
    }

    // Eagerly finalize before yielding "done" so the client's plan invalidation
    // sees the completed status rather than racing with the finally block.
    // Guard: only finalize plans that actually have workouts. A clarifying-question
    // turn writes no workouts; auto-finalizing an empty stub would flip it to
    // status=complete, causing the next continuation turn to lose coldStartBuild
    // mode and let the coach read/modify the wrong (existing active) plan.
    if (coldStartBuild) {
      const ids = new Set<string>(createdPlanIds);
      if (planId) ids.add(planId);
      for (const id of ids) {
        if (finalizedPlanIds.has(id)) continue;
        const planWorkouts = await db
          .select({ date: workouts.date, n: count() })
          .from(workouts)
          .where(eq(workouts.plan_id, id));
        if ((planWorkouts[0]?.n ?? 0) === 0) continue;
        const allDates = await db
          .select({ date: workouts.date })
          .from(workouts)
          .where(eq(workouts.plan_id, id))
          .orderBy(workouts.date)
          .limit(1);
        const firstWorkoutDate = allDates[0]?.date;
        try {
          await HANDLERS.finalize_plan(
            { plan_id: id, ...(firstWorkoutDate ? { start_date: firstWorkoutDate } : {}) },
            { userId, planId, coldStartBuild: true, today }
          );
          finalizedPlanIds.add(id);
          yield { type: "plan-finalized", plan_id: id };
        } catch (err) {
          console.error("auto-finalize failed", id, err);
        }
      }
    }

    yield { type: "done", message_id: assistantMessageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", error: message };
  } finally {
    // Safety net: finalize any plan not yet finalized if the loop threw before
    // reaching the eager finalize above. Same workout-count guard applies.
    if (coldStartBuild) {
      const ids = new Set<string>(createdPlanIds);
      if (planId) ids.add(planId);
      for (const id of ids) {
        if (finalizedPlanIds.has(id)) continue;
        try {
          const [wCnt] = await db
            .select({ n: count() })
            .from(workouts)
            .where(eq(workouts.plan_id, id));
          if ((wCnt?.n ?? 0) === 0) continue;
          const allDates = await db
            .select({ date: workouts.date })
            .from(workouts)
            .where(eq(workouts.plan_id, id))
            .orderBy(workouts.date)
            .limit(1);
          const firstWorkoutDate = allDates[0]?.date;
          await HANDLERS.finalize_plan(
            { plan_id: id, ...(firstWorkoutDate ? { start_date: firstWorkoutDate } : {}) },
            { userId, planId, coldStartBuild: true, today }
          );
        } catch (err) {
          console.error("auto-finalize failed", id, err);
        }
      }
    }
  }
}
