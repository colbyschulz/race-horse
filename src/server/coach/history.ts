// Getting stored conversation history into a shape the model API accepts and
// can cache: dropping blocks it would reject, adding the turn-scoped system
// messages, and placing the cache breakpoint. Kept apart from the run loop in
// runner.ts.
//
// Opus 5.5 checks each replayed thinking block against everything sent before
// it when it was made. So history is append-only: a message, once sent, goes
// back byte for byte on every later request. Anything that only matters for
// one turn (the recent training block) is a turn-scoped system message, which
// the API stops showing on its own once the turn moves on.
import type { Anthropic } from "@anthropic-ai/sdk";
import { RECENT_TRAINING_OPEN, RECENT_TRAINING_CLOSE } from "./context";
import type { StoredMessage } from "./types";

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

// Block types we send back to the API. Includes the blocks web search writes:
// web_search_20260209 runs code_execution on the server to filter results, so
// a search turn mixes server_tool_use and *_tool_result blocks in with thinking
// blocks. Those must be replayed exactly as returned: removing them changes
// what came before the turn's later thinking blocks, and the API rejects the
// request ("thinking blocks ... cannot be modified").
const ALLOWED_BLOCK_TYPES = new Set([
  "text",
  "tool_use",
  "tool_result",
  "image",
  "document",
  "thinking",
  "redacted_thinking",
  "server_tool_use",
  "web_search_tool_result",
  "web_fetch_tool_result",
  "code_execution_tool_result",
  "bash_code_execution_tool_result",
  "text_editor_code_execution_tool_result",
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

// Turn-scoped system messages: shown to the model only until a later user
// message exists (a tool_result message counts), then kept in the history at no
// input cost.
export const CLEAR_AT_BETA = "mid-conversation-system-clear-at-2026-08-21";

/** A `role: "system"` message inside `messages`. The SDK doesn't type these yet. */
export type TurnScopedSystemMessage = {
  role: "system";
  clear_at: "next_user_message";
  content: Anthropic.TextBlockParam[];
};

export type CoachMessage = Anthropic.MessageParam | TurnScopedSystemMessage;

export function isSystemMessage(m: CoachMessage): m is TurnScopedSystemMessage {
  return m.role === "system";
}

export function turnScopedSystemMessage(text: string): TurnScopedSystemMessage {
  return { role: "system", clear_at: "next_user_message", content: [{ type: "text", text }] };
}

/** Stored rows to API messages. System rows go back exactly as they were sent. */
export function toCoachMessages(rows: Pick<StoredMessage, "role" | "content">[]): CoachMessage[] {
  return rows.map((r) =>
    r.role === "system"
      ? {
          role: "system",
          clear_at: "next_user_message",
          content: r.content as Anthropic.TextBlockParam[],
        }
      : { role: r.role, content: r.content as Anthropic.ContentBlockParam[] }
  );
}

/**
 * Strip tool_use/tool_result pairs for tools not in our known set, plus any
 * block type outside ALLOWED_BLOCK_TYPES. Server tool blocks (web search and
 * the code execution it runs) are kept. The API rejects any tool_use that
 * lacks a matching result block.
 */
export function stripUnknownToolBlocks(msgs: CoachMessage[]): CoachMessage[] {
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
      const content = (m.content as { type: string; id?: string; tool_use_id?: string }[]).filter(
        (block) => {
          if (!ALLOWED_BLOCK_TYPES.has(block.type)) return false;
          if (block.type === "tool_use" && block.id && unknownIds.has(block.id)) return false;
          if (block.type === "tool_result" && block.tool_use_id && unknownIds.has(block.tool_use_id))
            return false;
          return true;
        }
      );
      if (content.length === m.content.length) return m;
      return { ...m, content } as CoachMessage;
    })
    .filter((m) => !Array.isArray(m.content) || m.content.length > 0);
}

/**
 * Remove broken tool_use/tool_result pairs anywhere in history (not just at the
 * tail). A handler crash can leave an assistant turn with tool_use blocks but no
 * following user turn with tool_result blocks — the Anthropic API rejects this
 * even when the broken pair is buried mid-conversation.
 */
export function sanitizeMessages(msgs: CoachMessage[]): CoachMessage[] {
  const out: CoachMessage[] = [];
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

/**
 * Drop turn-scoped system messages the API would reject where they stand. One
 * must follow a user message and come before an assistant message or end the
 * history; one directly followed by a user message is a 400. That happens when
 * a turn failed after its system message was stored: the athlete's next
 * message lands right after it. Dropping it changes no thinking block, because
 * no assistant message was ever produced with it in place.
 */
export function dropMisplacedSystemMessages(msgs: CoachMessage[]): CoachMessage[] {
  const nonSystemBefore: (CoachMessage | undefined)[] = [];
  let last: CoachMessage | undefined;
  for (const m of msgs) {
    nonSystemBefore.push(last);
    if (!isSystemMessage(m)) last = m;
  }
  const nonSystemAfter: (CoachMessage | undefined)[] = new Array(msgs.length);
  let next: CoachMessage | undefined;
  for (let i = msgs.length - 1; i >= 0; i--) {
    nonSystemAfter[i] = next;
    if (!isSystemMessage(msgs[i])) next = msgs[i];
  }
  return msgs.filter((m, i) => {
    if (!isSystemMessage(m)) return true;
    if (nonSystemBefore[i]?.role !== "user") return false;
    return nonSystemAfter[i]?.role !== "user";
  });
}

/** A "human" turn: a user message carrying at least one text block (not just tool results). */
function isHumanMessage(m: CoachMessage): boolean {
  if (m.role !== "user") return false;
  if (typeof m.content === "string") return true;
  return m.content.some((b) => (b as { type: string }).type === "text");
}

function lastHumanIndex(msgs: CoachMessage[]): number {
  for (let i = msgs.length - 1; i >= 0; i--) if (isHumanMessage(msgs[i])) return i;
  return -1;
}

const RECENT_TRAINING_ELIDED = `${RECENT_TRAINING_OPEN}(elided — superseded by the latest message)${RECENT_TRAINING_CLOSE}`;
const RECENT_TRAINING_RE = new RegExp(
  `${RECENT_TRAINING_OPEN}[\\s\\S]*?${RECENT_TRAINING_CLOSE}`,
  "g"
);

/**
 * Elide the recent training block from user messages stored before it moved
 * into turn-scoped system messages. New messages never carry it, so this only
 * touches old ones, and each of those only once (when the next human message
 * arrives). Everything else in history is sent exactly as stored: shortening
 * older tool output saved little and broke every later thinking block.
 */
export function compactOlderHistory(messages: CoachMessage[]): CoachMessage[] {
  const boundary = lastHumanIndex(messages);
  if (boundary <= 0) return messages;
  return messages.map((m, i) => {
    if (i >= boundary || m.role !== "user" || !Array.isArray(m.content)) return m;
    if (!m.content.some((b) => b.type === "text" && b.text.includes(RECENT_TRAINING_OPEN))) return m;
    const content = m.content.map((block) =>
      block.type === "text" && block.text.includes(RECENT_TRAINING_OPEN)
        ? { ...block, text: block.text.replace(RECENT_TRAINING_RE, RECENT_TRAINING_ELIDED) }
        : block
    );
    return { ...m, content };
  });
}

/**
 * Put a cache breakpoint near the end of history so repeated calls in a tool
 * loop (and the next turn) don't re-charge the stable part. It goes on the
 * last block of the user message before a trailing turn-scoped system message,
 * which can't carry one, or otherwise on the message before the newest one.
 * We already cache the system prompt; this covers the rest.
 */
export function withCacheBreakpoint(messages: CoachMessage[]): CoachMessage[] {
  if (messages.length < 2) return messages;
  let target: number;
  if (isSystemMessage(messages[messages.length - 1])) {
    target = messages.length - 1;
    while (target >= 0 && isSystemMessage(messages[target])) target--;
  } else {
    target = messages.length - 2;
    while (target >= 0 && isSystemMessage(messages[target])) target--;
  }
  if (target < 0) return messages;
  const out = messages.map((m) => ({ ...m })) as CoachMessage[];
  const m = out[target] as Anthropic.MessageParam;
  const content = Array.isArray(m.content)
    ? [...m.content]
    : [{ type: "text" as const, text: m.content }];
  if (content.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const last = content[content.length - 1] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content[content.length - 1] = { ...last, cache_control: CACHE_1H } as any;
    out[target] = { ...m, content };
  }
  return out;
}

/**
 * True when the previous human turn escalated to deep planning: the coach
 * called `request_deep_planning` somewhere between the previous human message
 * and the current one. The escalation covers "the rest of this turn and the
 * athlete's next turn", so the next turn is detected here from history.
 */
export function deepPlanningCarriedOver(messages: CoachMessage[]): boolean {
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
