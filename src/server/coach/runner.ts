import { eq, and, sql, count } from "drizzle-orm";
import { db } from "@/server/db";
import { users, plans, workouts } from "@/server/db/schema";
import { getAnthropic, COACH_MODEL, COACH_BUILD_MODEL } from "./anthropic";
import { COACH_SYSTEM_PROMPT } from "./system-prompt";
import { renderContextPrefix } from "./context";
import { routeLabel } from "@/lib/route-label";
import { loadHistory, appendMessage } from "./messages";
import { getTools, getColdStartTools, HANDLERS, summarizeToolResult } from "./tools/index";
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
]);

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

/**
 * Strip tool_use/tool_result pairs for tools not in our known set, plus any
 * non-standard block types (e.g. "server_tool_use" from built-in code_execution).
 * The API rejects any tool_use that lacks a matching result block.
 */
function stripUnknownToolBlocks(msgs: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  // Collect IDs of blocks to remove: standard tool_use with unknown names,
  // plus any non-standard block type (server_tool_use, etc.)
  const unknownIds = new Set<string>();
  for (const m of msgs) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      const block = b as { type: string; id?: string; name?: string };
      if (block.type === "tool_use" && block.id && block.name && !KNOWN_TOOLS.has(block.name)) {
        unknownIds.add(block.id);
      }
      // Non-standard types (server_tool_use, etc.) — collect id so we can
      // also remove any referencing result blocks
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
        // Drop any non-standard block type entirely
        if (!ALLOWED_BLOCK_TYPES.has(block.type)) return false;
        // Drop standard tool_use blocks whose name isn't in KNOWN_TOOLS
        if (block.type === "tool_use" && block.id && unknownIds.has(block.id)) return false;
        // Drop tool_result blocks that reference a stripped tool_use
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
          // Drop this broken assistant turn and skip the next user turn too
          // if it consists only of tool_results (it's the orphaned result side).
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

    // Drop orphaned tool_result user turns with no preceding tool_use.
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

const TOOL_CONTENT_LIMIT = 3000;
const TOOL_INTACT_WINDOW = 8; // keep last N messages fully intact

/**
 * Truncate large tool_use inputs and tool_result content in old history.
 * The model doesn't need the full JSON of a plan build that happened 10 turns ago —
 * only recent tool exchanges need their full payload. Keeps token counts manageable.
 */
function trimOldToolContent(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length <= TOOL_INTACT_WINDOW) return messages;
  // Keep last TOOL_INTACT_WINDOW messages intact; truncate tool payloads in older history
  return messages.map((m, i) => {
    if (i >= messages.length - TOOL_INTACT_WINDOW) return m;
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
    content[content.length - 1] = { ...last, cache_control: { type: "ephemeral" } } as any;
    out[out.length - 2] = { ...target, content };
  }
  return out;
}

export interface RunInput {
  userId: string;
  message: string;
  planId?: string | null;
  fromRoute?: string;
  planFileId?: string;
  today: string; // YYYY-MM-DD
  stravaPreload?: StravaPreload | null;
  coldStartBuild?: boolean;
}

export async function* runCoach(input: RunInput): AsyncGenerator<SSEEvent> {
  const { userId, message, fromRoute, planFileId, today } = input;
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
      // Count total and completed workouts
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

    // Plan-specific coach notes
    let planCoachNotes = "";
    if (planId) {
      const [planRow] = await db
        .select({ coach_notes: plans.coach_notes })
        .from(plans)
        .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
        .limit(1);
      planCoachNotes = planRow?.coach_notes ?? "";
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

    // 2. Build context prefix
    const contextPrefix = renderContextPrefix({
      today,
      units,
      activePlan: activePlanSummary,
      coachNotes,
      planCoachNotes,
      fromLabel: routeLabel(fromRoute),
      planFile: planFileSummary,
      stravaPreload: input.stravaPreload ?? null,
      coldStartBuild,
    });

    // 3. Persist user message
    await appendMessage(
      userId,
      "user",
      [{ type: "text", text: `${contextPrefix}\n\n${message}` }],
      planId
    );

    // 4. Reload full history
    const history = await loadHistory(userId, planId);

    // Build Anthropic messages array from history, stripping any trailing
    // incomplete tool_use/tool_result exchange from a previous crashed run.
    const rawMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role,
      content: m.content as Anthropic.ContentBlockParam[],
    }));
    const anthropicMessages = trimOldToolContent(
      sanitizeMessages(stripUnknownToolBlocks(rawMessages))
    );

    // 5. Call Anthropic SDK with streaming
    const client = getAnthropic();

    // System prompt with cache_control at end
    const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
      {
        type: "text",
        text: COACH_SYSTEM_PROMPT,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cache_control: { type: "ephemeral" } as any,
      },
    ];

    // We'll do an agentic loop: keep calling the API until stop_reason != "tool_use"
    let currentMessages = [...anthropicMessages];

    // For "done" event message_id, we'll use the stored message id
    let assistantMessageId = "";

    while (true) {
      const stream = client.messages.stream({
        model: coldStartBuild ? COACH_BUILD_MODEL : COACH_MODEL,
        max_tokens: 8096,
        system: systemBlocks,
        tools: coldStartBuild ? getColdStartTools(planId) : getTools(planId),
        messages: withCacheBreakpoint(currentMessages),
      });

      // Accumulate content blocks for this turn
      const turnBlocks: ContentBlock[] = [];
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
        } else if (event.type === "content_block_stop") {
          const entry = toolUseMap.get(event.index);
          if (entry) {
            // Finalize tool use block
            let parsedInput: unknown = {};
            try {
              parsedInput = JSON.parse(entry.inputJson || "{}");
            } catch {
              parsedInput = {};
            }
            turnBlocks.push({
              type: "tool_use",
              id: entry.id,
              name: entry.name,
              input: parsedInput,
            });
          }
        } else if (event.type === "message_delta") {
          stopReason = event.delta.stop_reason ?? null;
        }
      }

      // Collect text blocks from the final message
      const finalMsg = await stream.finalMessage();
      // Build turn blocks from final message content (authoritative)
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
        // fallback
        return block as ContentBlock;
      });

      const effectiveStopReason = stopReason ?? finalMsg.stop_reason;

      if (effectiveStopReason === "max_tokens") {
        throw new Error(
          "Response was too long to complete. Try asking for a smaller change (e.g. one week at a time)."
        );
      }

      if (effectiveStopReason !== "tool_use") {
        // Final turn — persist assistant message (text only, no tool_use blocks)
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

      // Add assistant turn to in-memory messages
      currentMessages = [
        ...currentMessages,
        { role: "assistant" as const, content: finalTurnBlocks as Anthropic.ContentBlockParam[] },
      ];

      // Process each tool call and build tool_result blocks
      const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        const toolName = toolBlock.name as ToolName;
        const handler = HANDLERS[toolName];

        yield { type: "tool-use", name: toolName, input: toolBlock.input };

        let resultValue: unknown;
        let resultText: string;

        try {
          if (handler) {
            resultValue = await handler(toolBlock.input, {
              userId,
              planId,
              coldStartBuild,
            });
          } else {
            resultValue = { error: `Unknown tool: ${toolName}` };
          }
        } catch (err) {
          // Convert handler errors to error result so the tool_result is always
          // persisted and history stays valid for subsequent requests.
          resultValue = { error: err instanceof Error ? err.message : String(err) };
        }
        resultText = JSON.stringify(resultValue);

        if (toolName === "create_plan") {
          const created = resultValue as { plan_id?: string } | null;
          if (created?.plan_id) createdPlanIds.push(created.plan_id);
        } else if (toolName === "finalize_plan") {
          const inp = toolBlock.input as { plan_id?: string } | null;
          if (inp?.plan_id) finalizedPlanIds.add(inp.plan_id);
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

      // Add tool results as user message in-memory
      currentMessages = [...currentMessages, { role: "user" as const, content: toolResultContent }];
    }

    // Eagerly finalize before yielding "done" so the client's plan invalidation
    // sees the completed status rather than racing with the finally block.
    // The plan being built is `planId` (pre-created stub) plus any extra plans
    // the model created via create_plan (defensive — create_plan is excluded
    // from cold-start tools, so this is normally empty).
    if (coldStartBuild) {
      const ids = new Set<string>(createdPlanIds);
      if (planId) ids.add(planId);
      for (const id of ids) {
        if (finalizedPlanIds.has(id)) continue;
        try {
          await HANDLERS.finalize_plan({ plan_id: id }, { userId, planId, coldStartBuild: true });
          finalizedPlanIds.add(id);
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
    // reaching the eager finalize above.
    if (coldStartBuild) {
      const ids = new Set<string>(createdPlanIds);
      if (planId) ids.add(planId);
      for (const id of ids) {
        if (finalizedPlanIds.has(id)) continue;
        try {
          await HANDLERS.finalize_plan({ plan_id: id }, { userId, planId, coldStartBuild: true });
        } catch (err) {
          console.error("auto-finalize failed", id, err);
        }
      }
    }
  }
}
