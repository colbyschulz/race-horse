import { eq, and, sql, count } from "drizzle-orm";
import { db } from "@/server/db";
import { users, plans, workouts } from "@/server/db/schema";
import {
  getAnthropic,
  COACH_MODEL,
  COACH_BUILD_MODEL,
  COACH_DEEP_MODEL,
  COACH_CHAT_EFFORT,
  COACH_BUILD_EFFORT,
  COACH_DEEP_EFFORT,
  COACH_CHAT_MAX_TOKENS,
  COACH_BUILD_MAX_TOKENS,
} from "./anthropic";
import { COACH_SYSTEM_PROMPT } from "./system-prompt";
import { renderContextPrefix } from "./context";
import { routeLabel } from "@/lib/route-label";
import { loadHistory, appendMessage } from "./messages";
import { getTools, getColdStartTools, HANDLERS, summarizeToolResult } from "./tools/index";
import { fetchRecentTraining, renderRecentTraining } from "./recent-training";
import {
  isBuildUnfinished,
  latestBuildProgress,
  mergeBuildProgress,
  type BuildProgress,
} from "./build-progress";
import type { SSEEvent, ToolName, ContentBlock } from "./types";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { StravaPreload } from "./strava-preload";
import {
  DEEP_PLANNING_TOOL,
  CACHE_1H,
  THINKING_DISPLAY_UPDATES,
  THINKING_UPDATES_BETA,
  INTERRUPTED_NOTE,
  stripUnknownToolBlocks,
  sanitizeMessages,
  compactOlderHistory,
  withCacheBreakpoint,
  deepPlanningCarriedOver,
} from "./history";

type Route = "chat" | "build" | "deep";

function routeConfig(route: Route): {
  model: string;
  max_tokens: number;
  effort: "high" | "xhigh";
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
      return { model: COACH_MODEL, max_tokens: COACH_CHAT_MAX_TOKENS, effort: COACH_CHAT_EFFORT };
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
  let buildProgress: BuildProgress | null = null;

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
    const timezone = (userRow.units as { timezone?: string })?.timezone || "UTC";
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
          timezone,
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

    // Read before compaction, which can shorten older tool inputs.
    buildProgress = latestBuildProgress(rawMessages);

    // Once weeks exist, a build may need to re-read them to act on feedback at a
    // check-in, because older tool calls in history get shortened.
    const tools = coldStartBuild
      ? getColdStartTools(planId, { canReadPlan: buildProgress != null })
      : getTools(planId);

    let currentMessages = [...anthropicMessages];
    let assistantMessageId = "";
    let apiCalls = 0;

    while (true) {
      const cfg = routeConfig(route);
      apiCalls++;

      const stream = client.messages.stream(
        {
          model: cfg.model,
          max_tokens: cfg.max_tokens,
          // Adaptive thinking on every route: Opus 5.5 thinks by default and
          // rejects disabling it. Effort is pinned per route, because a
          // mid-conversation effort change breaks the messages cache.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          thinking: THINKING_DISPLAY_UPDATES as any,
          output_config: { effort: cfg.effort },
          system: systemBlocks,
          tools,
          messages: withCacheBreakpoint(currentMessages),
        },
        { headers: { "anthropic-beta": THINKING_UPDATES_BETA } }
      );

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
            // Announced now because writing a large call can take a while.
            yield { type: "tool-start", id: block.id, name: block.name };
          } else if (block.type === "server_tool_use") {
            yield { type: "tool-start", id: block.id, name: block.name };
          } else if (block.type === "web_search_tool_result") {
            yield {
              type: "tool-result",
              id: block.tool_use_id,
              name: "web_search",
              result_summary: "Searched the web",
            };
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            yield { type: "text-delta", delta: delta.text };
          } else if (delta.type === "thinking_delta") {
            if (delta.thinking && delta.thinking !== INTERRUPTED_NOTE) {
              yield { type: "progress-delta", delta: delta.thinking };
            }
          } else if (delta.type === "input_json_delta") {
            const entry = toolUseMap.get(event.index);
            if (entry) {
              entry.inputJson += delta.partial_json;
            }
          }
          // signature_delta: not surfaced; the final message carries the
          // complete blocks and they're persisted from there.
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

        // A plan paused at a check-in must not be marked finished. The coach can
        // shorten a plan by rewriting its last week with the new total_weeks.
        if (toolName === "finalize_plan" && coldStartBuild && isBuildUnfinished(buildProgress)) {
          yield {
            type: "tool-result",
            id: toolBlock.id,
            name: toolName,
            result_summary: "More weeks still to write",
          };
          toolResultContent.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            is_error: true,
            content: JSON.stringify({
              error: `Only ${buildProgress?.week} of ${buildProgress?.total} weeks are written, so the plan can't be finalized yet. Write the remaining weeks first. If the plan is now shorter, rewrite its last week with the new total_weeks.`,
            }),
          });
          continue;
        }

        yield { type: "tool-use", id: toolBlock.id, name: toolName, input: toolBlock.input };

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
        } else if (toolName === "update_workouts") {
          buildProgress = mergeBuildProgress(buildProgress, toolBlock.input);
        } else if (toolName === DEEP_PLANNING_TOOL && route === "chat") {
          // Rest of this turn runs on the deep model. The next human turn is
          // picked up from history by deepPlanningCarriedOver().
          route = "deep";
        }

        const summary =
          handler != null
            ? summarizeToolResult(toolName, resultValue)
            : `Unknown tool: ${toolName}`;

        yield { type: "tool-result", id: toolBlock.id, name: toolName, result_summary: summary };

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
    // mode and let the coach read/modify the wrong (existing active) plan. The same
    // applies to a plan paused at a check-in with weeks still to write.
    if (coldStartBuild && !isBuildUnfinished(buildProgress)) {
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
    // reaching the eager finalize above. Same guards apply.
    if (coldStartBuild && !isBuildUnfinished(buildProgress)) {
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
