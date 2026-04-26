import { eq, and, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { users, plans, workouts } from "@/db/schema";
import { getAnthropic, COACH_MODEL } from "./anthropic";
import { COACH_SYSTEM_PROMPT } from "./systemPrompt";
import { renderContextPrefix, routeLabel } from "./context";
import { loadHistory, appendMessage } from "./messages";
import { TOOLS, HANDLERS, summarizeToolResult } from "./tools/index";
import type { SSEEvent, ToolName, ContentBlock } from "./types";
import type { Anthropic } from "@anthropic-ai/sdk";

/**
 * Drop any trailing messages that form an incomplete tool_use/tool_result pair.
 * A crashed run can leave an assistant message with tool_use blocks but no
 * following user message with tool_result blocks — the Anthropic API rejects this.
 */
function sanitizeMessages(msgs: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const out = [...msgs];
  // Walk backwards and drop trailing incomplete tool exchanges.
  while (out.length > 0) {
    const last = out[out.length - 1];
    const content = Array.isArray(last.content) ? last.content : [];
    const hasToolResult = content.some((b) => (b as { type: string }).type === "tool_result");
    const secondLast = out.length >= 2 ? out[out.length - 2] : null;
    const secondLastContent = secondLast && Array.isArray(secondLast.content) ? secondLast.content : [];
    const secondLastHasToolUse = secondLastContent.some((b) => (b as { type: string }).type === "tool_use");

    if (last.role === "assistant") {
      const hasToolUse = content.some((b) => (b as { type: string }).type === "tool_use");
      if (hasToolUse) {
        // Trailing assistant turn with tool_use but no following tool_result — drop it.
        out.pop();
        continue;
      }
    } else if (last.role === "user" && hasToolResult && !secondLastHasToolUse) {
      // Orphaned tool_result with no preceding tool_use assistant turn — drop it.
      out.pop();
      continue;
    }
    break;
  }
  return out;
}

export interface RunInput {
  userId: string;
  message: string;
  fromRoute?: string;
  today: string; // YYYY-MM-DD
}

export async function* runCoach(input: RunInput): AsyncGenerator<SSEEvent> {
  const { userId, message, fromRoute, today } = input;

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
                  (7 * 24 * 60 * 60 * 1000),
              ),
            )
          : null;

      activePlanSummary = {
        title: activePlan.title,
        weeks_left: weeksLeft,
        workout_count: Number(workoutCounts?.total ?? 0),
        completed: Number(workoutCounts?.completed ?? 0),
      };
    }

    // 2. Build context prefix
    const contextPrefix = renderContextPrefix({
      today,
      units,
      activePlan: activePlanSummary,
      coachNotes,
      fromLabel: routeLabel(fromRoute),
    });

    // 3. Persist user message
    await appendMessage(userId, "user", [
      { type: "text", text: `${contextPrefix}\n\n${message}` },
    ]);

    // 4. Reload full history
    const history = await loadHistory(userId);

    // Build Anthropic messages array from history, stripping any trailing
    // incomplete tool_use/tool_result exchange from a previous crashed run.
    const rawMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role,
      content: m.content as Anthropic.ContentBlockParam[],
    }));
    const anthropicMessages = sanitizeMessages(rawMessages);

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
        model: COACH_MODEL,
        max_tokens: 8096,
        system: systemBlocks,
        tools: TOOLS,
        messages: currentMessages,
      });

      // Accumulate content blocks for this turn
      const turnBlocks: ContentBlock[] = [];
      // Track tool use blocks being built: index -> partial block
      const toolUseMap = new Map<
        number,
        { id: string; name: string; inputJson: string }
      >();

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

      if (effectiveStopReason !== "tool_use") {
        // Final turn — persist assistant message (text only, no tool_use blocks)
        const storedMsg = await appendMessage(userId, "assistant", finalTurnBlocks);
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
      await appendMessage(userId, "assistant", finalTurnBlocks as ContentBlock[]);

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

        if (handler) {
          resultValue = await handler(toolBlock.input, { userId });
          resultText = JSON.stringify(resultValue);
        } else {
          resultValue = { error: `Unknown tool: ${toolName}` };
          resultText = JSON.stringify(resultValue);
        }

        const summary = handler != null
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
      await appendMessage(userId, "user", toolResultContent as ContentBlock[]);

      // Add tool results as user message in-memory
      currentMessages = [
        ...currentMessages,
        { role: "user" as const, content: toolResultContent },
      ];
    }

    yield { type: "done", message_id: assistantMessageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", error: message };
    throw err;
  }
}
