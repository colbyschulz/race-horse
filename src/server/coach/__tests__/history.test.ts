import { describe, it, expect } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import {
  stripUnknownToolBlocks,
  dropMisplacedSystemMessages,
  compactOlderHistory,
  withCacheBreakpoint,
  toCoachMessages,
  turnScopedSystemMessage,
  type CoachMessage,
} from "../history";

// A web search turn as Opus 5.5 returns it: web_search_20260209 runs
// code_execution on the server, and thinking blocks sit between the server
// tool blocks.
const webSearchTurn = [
  { type: "thinking", thinking: "", signature: "sig-1" },
  {
    type: "server_tool_use",
    id: "srvtoolu_1",
    name: "code_execution",
    input: { code: "print(1)" },
  },
  {
    type: "server_tool_use",
    id: "srvtoolu_2",
    name: "web_search",
    input: { query: "marathon taper" },
    caller: { type: "code_execution_20260120", tool_id: "srvtoolu_1" },
  },
  {
    type: "web_search_tool_result",
    tool_use_id: "srvtoolu_2",
    content: [],
    caller: { type: "code_execution_20260120", tool_id: "srvtoolu_1" },
  },
  {
    type: "code_execution_tool_result",
    tool_use_id: "srvtoolu_1",
    content: { type: "code_execution_result", stdout: "1", stderr: "", return_code: 0, content: [] },
  },
  { type: "thinking", thinking: "", signature: "sig-2" },
  { type: "tool_use", id: "toolu_1", name: "update_workouts", input: { plan_id: "p" } },
] as unknown as Anthropic.ContentBlockParam[];

describe("stripUnknownToolBlocks", () => {
  it("replays a web search turn exactly as the API returned it", () => {
    const msgs: Anthropic.MessageParam[] = [
      { role: "user", content: [{ type: "text", text: "taper?" }] },
      { role: "assistant", content: webSearchTurn },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "{}" }],
      },
    ];

    const out = stripUnknownToolBlocks(msgs);

    expect(out).toEqual(msgs);
    expect(out[1].content).toBe(webSearchTurn);
  });

  it("still drops calls to tools the coach no longer has, with their results", () => {
    const msgs: Anthropic.MessageParam[] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Checking." },
          { type: "tool_use", id: "toolu_old", name: "retired_tool", input: {} },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_old", content: "{}" }],
      },
    ];

    const out = stripUnknownToolBlocks(msgs);

    expect(out).toEqual([
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "Checking." }] },
    ]);
  });

  it("drops block types the API doesn't take back", () => {
    const msgs = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Hello." },
          { type: "mystery_block", id: "x1" },
        ],
      },
    ] as unknown as Anthropic.MessageParam[];

    const out = stripUnknownToolBlocks(msgs);

    expect(out[1].content).toEqual([{ type: "text", text: "Hello." }]);
  });
});

const human = (text: string): CoachMessage => ({ role: "user", content: [{ type: "text", text }] });
const reply = (text: string): CoachMessage => ({ role: "assistant", content: [{ type: "text", text }] });
const training = turnScopedSystemMessage("<recent_training>\nweek\n</recent_training>");
const callTool: CoachMessage = {
  role: "assistant",
  content: [{ type: "tool_use", id: "toolu_1", name: "get_plan", input: {} }],
};
const toolResult: CoachMessage = {
  role: "user",
  content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "x".repeat(5000) }],
};

describe("toCoachMessages", () => {
  it("turns stored system rows back into turn-scoped system messages", () => {
    const content = [{ type: "text" as const, text: "<recent_training>\nweek\n</recent_training>" }];
    expect(toCoachMessages([{ role: "system", content }])).toEqual([
      { role: "system", clear_at: "next_user_message", content },
    ]);
  });
});

describe("dropMisplacedSystemMessages", () => {
  it("keeps a system message after a user message and before a reply or at the end", () => {
    const msgs = [human("a"), training, callTool, toolResult, training, reply("b"), human("c"), training];
    expect(dropMisplacedSystemMessages(msgs)).toEqual(msgs);
  });

  it("drops one a failed turn left directly before the next user message", () => {
    const msgs = [human("a"), training, human("b"), training];
    expect(dropMisplacedSystemMessages(msgs)).toEqual([human("a"), human("b"), training]);
  });

  it("drops one that doesn't follow a user message", () => {
    expect(dropMisplacedSystemMessages([human("a"), reply("b"), training])).toEqual([
      human("a"),
      reply("b"),
    ]);
  });
});

describe("compactOlderHistory", () => {
  it("leaves older tool output and system messages exactly as stored", () => {
    const msgs = [human("a"), training, callTool, toolResult, training, reply("b"), human("c")];
    expect(compactOlderHistory(msgs)).toEqual(msgs);
  });

  it("still elides recent training stored inside older user messages", () => {
    const legacy = human("<context>\n<recent_training>\nold week\n</recent_training>\n</context>\n\nhi");
    const out = compactOlderHistory([legacy, reply("b"), human("c")]);
    expect((out[0].content as { text: string }[])[0].text).toBe(
      "<context>\n<recent_training>(elided — superseded by the latest message)</recent_training>\n</context>\n\nhi"
    );
  });
});

describe("withCacheBreakpoint", () => {
  const cacheOf = (m: CoachMessage) =>
    (m.content as { cache_control?: unknown }[]).at(-1)?.cache_control;

  it("puts it on the user message before a trailing system message", () => {
    const out = withCacheBreakpoint([human("a"), training, callTool, toolResult, training]);
    expect(cacheOf(out[3])).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(out[4]).toEqual(training);
    expect(out.filter((m) => cacheOf(m))).toHaveLength(1);
  });

  it("skips system messages when the history ends in a user message", () => {
    const out = withCacheBreakpoint([human("a"), training, reply("b"), human("c")]);
    expect(cacheOf(out[2])).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("never marks a system message", () => {
    const out = withCacheBreakpoint([human("a"), training, human("c")]);
    expect(cacheOf(out[0])).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(out[1]).toEqual(training);
  });
});
