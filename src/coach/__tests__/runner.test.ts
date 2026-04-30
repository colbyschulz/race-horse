import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SSEEvent } from "../types";
import type { StravaPreload } from "../strava-preload";

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------
const mockUserRow = {
  units: { units: "mi" },
  coach_notes: "athlete is strong",
};
const mockPlanRow = {
  id: "plan-1",
  title: "Marathon Base",
  mode: "goal",
  end_date: "2026-12-01",
};
const mockWorkoutCounts = { total: 20, completed: 5 };

// We need to mimic drizzle's chained query builder
function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "limit", "select"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // .limit() resolves
  (chain.limit as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
  // also allow awaiting the chain itself (for count queries without .limit)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chain as any).then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null
  ) => Promise.resolve(rows).then(onfulfilled ?? undefined, onrejected ?? undefined);
  return chain;
}

let userSelectChain = makeSelectChain([mockUserRow]);
let planSelectChain = makeSelectChain([mockPlanRow]);
let workoutSelectChain = makeSelectChain([mockWorkoutCounts]);
let selectCallCount = 0;

vi.mock("@/db", () => ({
  db: {
    select: vi.fn((...args: unknown[]) => {
      selectCallCount++;
      // Call 1 = user query, Call 2 = plans query, Call 3 = workout counts
      if (selectCallCount === 1) return userSelectChain;
      if (selectCallCount === 2) return planSelectChain;
      return workoutSelectChain;
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id", preferences: "preferences", coach_notes: "coach_notes" },
  plans: {
    id: "id",
    title: "title",
    mode: "mode",
    end_date: "end_date",
    userId: "userId",
    is_active: "is_active",
  },
  workouts: { plan_id: "plan_id", date: "date" },
  messages: {},
}));

// ---------------------------------------------------------------------------
// Messages mock
// ---------------------------------------------------------------------------
const mockAppendMessage = vi.fn();
const mockLoadHistory = vi.fn();

vi.mock("@/coach/messages", () => ({
  appendMessage: (...args: unknown[]) => mockAppendMessage(...args),
  loadHistory: (...args: unknown[]) => mockLoadHistory(...args),
}));

// ---------------------------------------------------------------------------
// Anthropic mock
// ---------------------------------------------------------------------------
// We'll simulate: text delta, then tool_use, then tool_result, then final text
function makeStreamEvents(
  events: import("@anthropic-ai/sdk/resources/messages").RawMessageStreamEvent[]
) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const e of events) yield e;
    },
    finalMessage: vi.fn(),
  };
}

const mockCreate = vi.fn();
const mockStream = vi.fn();

vi.mock("@/coach/anthropic", () => ({
  getAnthropic: () => ({
    messages: {
      stream: mockStream,
    },
  }),
  COACH_MODEL: "claude-test",
  COACH_BUILD_MODEL: "claude-test-build",
}));

// ---------------------------------------------------------------------------
// Tools mock — replace HANDLERS with a simple mock
// ---------------------------------------------------------------------------
vi.mock("@/coach/tools", () => ({
  getTools: vi.fn().mockReturnValue([]),
  getColdStartTools: vi.fn().mockReturnValue([]),
  HANDLERS: {
    get_active_plan: vi.fn().mockResolvedValue({ id: "plan-1", title: "Marathon Base" }),
  },
  summarizeToolResult: vi.fn().mockReturnValue("Read active plan"),
}));

// ---------------------------------------------------------------------------
// Helper: collect all events from the async generator
// ---------------------------------------------------------------------------
async function collectEvents(gen: AsyncGenerator<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const e of gen) {
    events.push(e);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("runCoach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
    userSelectChain = makeSelectChain([mockUserRow]);
    planSelectChain = makeSelectChain([mockPlanRow]);
    workoutSelectChain = makeSelectChain([mockWorkoutCounts]);

    // appendMessage: first call (user), returns nothing important
    // second call (assistant), returns { id: "msg-asst-1" }
    mockAppendMessage
      .mockResolvedValueOnce({ id: "msg-user-1" })
      .mockResolvedValueOnce({ id: "msg-asst-1" });

    // loadHistory returns a simple user message
    mockLoadHistory.mockResolvedValue([
      {
        id: "m1",
        role: "user",
        content: [{ type: "text", text: "ctx\n\nHello" }],
        created_at: new Date(),
      },
    ]);
  });

  it("emits text-delta, done; calls appendMessage for user and assistant", async () => {
    // Single turn: text only, no tools
    const streamEvents = [
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello!" } },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: {
          stop_reason: "end_turn",
          stop_sequence: null,
          container: null,
          stop_details: null,
        },
        usage: { output_tokens: 5 },
      },
      { type: "message_stop" },
    ] as import("@anthropic-ai/sdk/resources/messages").RawMessageStreamEvent[];

    const fakeStream = {
      [Symbol.asyncIterator]: async function* () {
        for (const e of streamEvents) yield e;
      },
      finalMessage: vi.fn().mockResolvedValue({
        id: "msg-api",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Hello!" }],
      }),
    };
    mockStream.mockReturnValue(fakeStream);

    const { runCoach } = await import("../runner");
    const events = await collectEvents(
      runCoach({ userId: "u1", message: "Hi coach", fromRoute: "/today", today: "2026-04-26" })
    );

    // Verify SSE event order
    expect(events[0]).toMatchObject({ type: "text-delta", delta: "Hello!" });
    expect(events[events.length - 1]).toMatchObject({ type: "done", message_id: "msg-asst-1" });

    // appendMessage called for user and assistant
    expect(mockAppendMessage).toHaveBeenCalledTimes(2);
    expect(mockAppendMessage.mock.calls[0][1]).toBe("user");
    expect(mockAppendMessage.mock.calls[1][1]).toBe("assistant");
  });

  it("calls tool handler with correct userId and emits tool-use / tool-result events", async () => {
    // Turn 1: tool_use; Turn 2: text + end_turn
    const turn1StreamEvents = [
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "tu-1", name: "get_active_plan", input: {} },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "{}" },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: {
          stop_reason: "tool_use",
          stop_sequence: null,
          container: null,
          stop_details: null,
        },
        usage: { output_tokens: 10 },
      },
      { type: "message_stop" },
    ] as import("@anthropic-ai/sdk/resources/messages").RawMessageStreamEvent[];

    const turn2StreamEvents = [
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Plan found." } },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: {
          stop_reason: "end_turn",
          stop_sequence: null,
          container: null,
          stop_details: null,
        },
        usage: { output_tokens: 5 },
      },
      { type: "message_stop" },
    ] as import("@anthropic-ai/sdk/resources/messages").RawMessageStreamEvent[];

    const fakeStream1 = {
      [Symbol.asyncIterator]: async function* () {
        for (const e of turn1StreamEvents) yield e;
      },
      finalMessage: vi.fn().mockResolvedValue({
        id: "msg-api-1",
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu-1", name: "get_active_plan", input: {} }],
      }),
    };

    const fakeStream2 = {
      [Symbol.asyncIterator]: async function* () {
        for (const e of turn2StreamEvents) yield e;
      },
      finalMessage: vi.fn().mockResolvedValue({
        id: "msg-api-2",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Plan found." }],
      }),
    };

    mockStream.mockReturnValueOnce(fakeStream1).mockReturnValueOnce(fakeStream2);

    // Need a second appendMessage for this test too
    mockAppendMessage
      .mockResolvedValueOnce({ id: "msg-user-1" })
      .mockResolvedValueOnce({ id: "msg-asst-1" });

    const { runCoach } = await import("../runner");
    const events = await collectEvents(
      runCoach({ userId: "u1", message: "What's my plan?", today: "2026-04-26" })
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("tool-use");
    expect(types).toContain("tool-result");
    expect(types).toContain("text-delta");
    expect(types[types.length - 1]).toBe("done");

    // Verify tool handler was called with userId
    const { HANDLERS } = await import("@/coach/tools");
    expect(HANDLERS.get_active_plan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "u1" })
    );
  });

  it("passes stravaPreload and coldStartBuild to renderContextPrefix", async () => {
    const preload: StravaPreload = {
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
    };

    const streamEvents = [
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello!" } },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: {
          stop_reason: "end_turn",
          stop_sequence: null,
          container: null,
          stop_details: null,
        },
        usage: { output_tokens: 5 },
      },
      { type: "message_stop" },
    ] as import("@anthropic-ai/sdk/resources/messages").RawMessageStreamEvent[];

    const fakeStream = {
      [Symbol.asyncIterator]: async function* () {
        for (const e of streamEvents) yield e;
      },
      finalMessage: vi.fn().mockResolvedValue({
        id: "msg-api",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Hello!" }],
      }),
    };
    mockStream.mockReturnValue(fakeStream);

    const { runCoach } = await import("../runner");
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

    // The first appendMessage call (role="user") should contain a context prefix
    // that includes both new sections.
    const firstUserCall = (
      mockAppendMessage as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.find((c) => c[1] === "user");
    const content = firstUserCall?.[2] as { type: string; text: string }[];
    const text = content[0]?.text ?? "";
    expect(text).toContain("Cold-start plan build: true");
    expect(text).toContain("Strava history: minimal");
  });
});
