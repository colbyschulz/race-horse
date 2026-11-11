// Getting stored conversation history into a shape the model API accepts and
// can cache: dropping blocks it would reject, shrinking old tool output, and
// placing the cache breakpoint. Kept apart from the run loop in runner.ts.
import type { Anthropic } from "@anthropic-ai/sdk";
import { RECENT_TRAINING_OPEN, RECENT_TRAINING_CLOSE } from "./context";

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

export const DEEP_PLANNING_TOOL = "request_deep_planning";

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
export const CACHE_1H = { type: "ephemeral", ttl: "1h" } as const;

// Opus 5.5 returns its notes between tool calls as thinking blocks, which come
// back empty by default. "updates" returns those notes as text and keeps its
// reasoning hidden, so a long turn doesn't look silent to the athlete.
export const THINKING_DISPLAY_UPDATES = { type: "adaptive", display: "updates" } as const;
export const THINKING_UPDATES_BETA = "thinking-display-updates-2026-08-18";
export const INTERRUPTED_NOTE = "This part of the response was interrupted before it finished.";

/**
 * Strip tool_use/tool_result pairs for tools not in our known set, plus any
 * non-standard block types (e.g. "server_tool_use" from built-in code_execution).
 * The API rejects any tool_use that lacks a matching result block.
 */
export function stripUnknownToolBlocks(msgs: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
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
export function sanitizeMessages(msgs: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
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
export function compactOlderHistory(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
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
export function withCacheBreakpoint(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
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
export function deepPlanningCarriedOver(messages: Anthropic.MessageParam[]): boolean {
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
