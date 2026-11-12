import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StoredMessage } from "@/types/coach";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/queries/preferences", () => ({
  usePreferences: () => ({ data: { units: "mi" } }),
}));
vi.mock("@/components/coach/message-bubble", () => ({
  MessageBubble: ({ message }: { message: StoredMessage }) => (
    <div>{(message.content as { text?: string }[]).map((b) => b.text).join("")}</div>
  ),
}));

vi.mock("@/components/coach/build-form-card", () => ({
  BuildFormCard: ({ onSubmit }: { onSubmit: (v: unknown) => void }) => (
    <button onClick={() => onSubmit({ sport: "run", goal_type: "indefinite" })}>Build plan</button>
  ),
}));

import { CoachPageClient } from "../coach-page-client";
import { COACH_UNREACHABLE_MESSAGE, TURN_CUT_OFF_MESSAGE } from "@/lib/turn-poll";

function stored(id: string, role: "user" | "assistant", text: string): StoredMessage {
  return {
    id,
    role,
    plan_id: "p1",
    created_at: new Date("2026-11-04T12:00:00Z"),
    content: [{ type: "text", text }],
  } as StoredMessage;
}

const USER_MSG = stored("m1", "user", "What should I run?");
const FINISHED_REPLY = stored("m2", "assistant", "Run easy today.");

type Turn = { status: string; error_message: string | null; started_at: string } | null;

const doneTurn: Turn = { status: "done", error_message: null, started_at: "2026-11-04T12:00:00Z" };
const runningTurn = (): Turn => ({
  status: "running",
  error_message: null,
  started_at: new Date().toISOString(),
});

/** Scripted backend: each test sets what the coach endpoints answer. */
let turnStatus: Turn | Error;
let serverMessages: StoredMessage[];
let chatResponse: () => Promise<Response>;
let buildResponse: (body: { plan_id?: string }) => Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function sseBody(chunks: string[], fail?: Error): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      if (fail) c.error(fail);
      else c.close();
    },
  });
}

const textDelta = `event: text-delta\ndata: ${JSON.stringify({ type: "text-delta", delta: "Partial reply" })}\n\n`;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("/api/coach/turn-status")) {
    if (turnStatus instanceof Error) throw turnStatus;
    return json({ turn: turnStatus });
  }
  if (url.startsWith("/api/coach/messages")) return json({ messages: serverMessages });
  if (url.startsWith("/api/coach/chat")) return chatResponse();
  if (url.startsWith("/api/coach/build")) return buildResponse(JSON.parse(String(init?.body)));
  throw new Error(`unexpected fetch: ${url}`);
});

const alertMock = vi.fn();

function renderPage(initialMessages: StoredMessage[] = []) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CoachPageClient initialMessages={initialMessages} planId="p1" />
    </QueryClientProvider>
  );
}

function callsTo(path: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input).startsWith(path)).length;
}

async function sendMessage(text: string) {
  const input = await screen.findByRole("textbox");
  await waitFor(() => expect(input).not.toBeDisabled());
  await userEvent.type(input, `${text}{Enter}`);
}

beforeEach(() => {
  turnStatus = doneTurn;
  serverMessages = [];
  chatResponse = async () => new Response(sseBody([]), { status: 200 });
  buildResponse = async () => new Response(sseBody([]), { status: 200 });
  fetchMock.mockClear();
  alertMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("alert", alertMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function sse(event: Record<string, unknown>) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

describe("CoachPageClient activity", () => {
  it("shows steps live as the coach works, with short narration as notes", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    chatResponse = async () => {
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(c) {
          c.enqueue(enc.encode(sse({ type: "text-delta", delta: "Checking your plan first." })));
          c.enqueue(enc.encode(sse({ type: "tool-start", id: "t1", name: "update_workouts" })));
          await gate;
          c.enqueue(
            enc.encode(
              sse({
                type: "tool-use",
                id: "t1",
                name: "update_workouts",
                input: { week_number: 3, total_weeks: 13, operations: [] },
              })
            )
          );
          await new Promise((r) => setTimeout(r, 20));
          c.enqueue(
            enc.encode(sse({ type: "tool-result", id: "t1", name: "update_workouts", result_summary: "Week 3 of 13 saved" }))
          );
          await new Promise((r) => setTimeout(r, 20));
          c.enqueue(enc.encode(sse({ type: "done", message_id: "m9" })));
          c.close();
        },
      });
      return new Response(body, { status: 200 });
    };
    renderPage();
    await sendMessage("Write my plan");

    // Named while the call is still being written, before its details arrive.
    expect(await screen.findByText("Updating your plan…")).toBeInTheDocument();
    expect(screen.getByText("Checking your plan first.").tagName).toBe("P");
    // The step row says what's happening, so the line under the turn steps
    // aside, and nothing yet says it will be a long one.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    serverMessages = [USER_MSG, FINISHED_REPLY];
    release();
    // Once the step turns out to be a week of a plan, the athlete is told to expect a wait.
    expect(await screen.findByText(/Writing a full plan takes a few minutes/)).toBeInTheDocument();
    expect(await screen.findByText("Run easy today.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("collapses a finished turn's steps above the reply", async () => {
    serverMessages = [
      USER_MSG,
      {
        ...FINISHED_REPLY,
        id: "a1",
        content: [
          { type: "text", text: "Checking your laps." },
          { type: "tool_use", id: "t1", name: "get_activity_laps", input: {} },
        ],
      } as StoredMessage,
      { ...USER_MSG, id: "u2", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] } as StoredMessage,
      FINISHED_REPLY,
    ];
    const { container } = renderPage();

    expect(await screen.findByText("Run easy today.")).toBeInTheDocument();
    expect(screen.getByText("1 step")).toBeInTheDocument();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Read your splits")).toBeInTheDocument();
    expect(screen.getByText("Checking your laps.")).toBeInTheDocument();
  });

  it("shows the coach is still working on a turn found already running", async () => {
    turnStatus = runningTurn();
    serverMessages = [USER_MSG];
    renderPage([USER_MSG]);

    expect(await screen.findByRole("status")).toHaveTextContent(/^Working$/);
  });

  it("shows completed steps and keeps them open when returning to a running turn", async () => {
    turnStatus = runningTurn();
    serverMessages = [
      USER_MSG,
      {
        ...FINISHED_REPLY,
        id: "a1",
        content: [{ type: "tool_use", id: "t1", name: "get_active_plan", input: {} }],
      } as StoredMessage,
    ];
    const { container } = renderPage();

    expect(await screen.findByText("Read your plan")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("details")).toHaveAttribute("open"));
  });
});

describe("CoachPageClient build", () => {
  function renderBuildForm() {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <CoachPageClient initialMessages={[]} planId={null} intent="build" />
      </QueryClientProvider>
    );
  }

  it("re-sends a dropped build under the same plan and follows it if the first one arrived", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const sentPlanIds: (string | undefined)[] = [];
    buildResponse = async (body) => {
      sentPlanIds.push(body.plan_id);
      if (sentPlanIds.length === 1) throw new TypeError("Load failed");
      return new Response(JSON.stringify({ error: "this build has already started" }), {
        status: 409,
      });
    };
    renderBuildForm();
    await userEvent.click(await screen.findByRole("button", { name: "Build plan" }));

    await waitFor(() => expect(replaceState).toHaveBeenCalled(), { timeout: 4000 });
    expect(sentPlanIds).toHaveLength(2);
    expect(sentPlanIds[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(sentPlanIds[1]).toBe(sentPlanIds[0]);
    expect(replaceState).toHaveBeenCalledWith(null, "", `/coach?plan_id=${sentPlanIds[0]}`);
    expect(alertMock).not.toHaveBeenCalled();
  });

  /** A build whose stream stays open until the test lets it finish. */
  function gatedBuild(events: Record<string, unknown>[]) {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    buildResponse = async () => {
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(c) {
          await gate;
          for (const ev of events) c.enqueue(enc.encode(sse(ev)));
          c.close();
        },
      });
      return new Response(body, { status: 200 });
    };
    return () => release();
  }

  it("keeps a way back to the plans list on screen while a plan is being built", async () => {
    const finish = gatedBuild([{ type: "done" }]);
    renderBuildForm();
    expect(await screen.findByRole("link", { name: /Back to Plans/ })).toHaveAttribute(
      "href",
      "/plans"
    );

    await userEvent.click(screen.getByRole("button", { name: "Build plan" }));
    await waitFor(() => expect(callsTo("/api/coach/build")).toBe(1));
    expect(screen.getByRole("link", { name: /Back to Plans/ })).toHaveAttribute("href", "/plans");
    finish();
  });

  it("leaves the address alone when a build finishes after the athlete has left", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const finish = gatedBuild([
      { type: "plan-created", plan_id: "new-plan" },
      { type: "plan-finalized" },
      { type: "done" },
    ]);
    const { unmount } = renderBuildForm();
    await userEvent.click(await screen.findByRole("button", { name: "Build plan" }));
    await waitFor(() => expect(callsTo("/api/coach/build")).toBe(1));

    unmount();
    finish();

    // The plan lookup is the last thing a finished build does before the URL.
    await waitFor(() => expect(callsTo("/api/plans/new-plan")).toBe(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(replaceState).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("justBuiltPlanId")).toBeNull();
  });

  it("keeps the form and says so when a build can't be sent at all", async () => {
    buildResponse = async () => {
      throw new TypeError("Failed to fetch");
    };
    renderBuildForm();
    await userEvent.click(await screen.findByRole("button", { name: "Build plan" }));

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith(COACH_UNREACHABLE_MESSAGE), {
      timeout: 4000,
    });
    expect(screen.getByRole("button", { name: "Build plan" })).toBeInTheDocument();
  });
});

describe("CoachPageClient reconnect", () => {
  it("shows a reply that finished while the athlete was away", async () => {
    serverMessages = [USER_MSG, FINISHED_REPLY];
    renderPage([USER_MSG]);
    expect(await screen.findByText("Run easy today.")).toBeInTheDocument();
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("doesn't report a dropped connection as a timeout, and shows the finished reply", async () => {
    serverMessages = [USER_MSG, FINISHED_REPLY];
    chatResponse = async () =>
      new Response(sseBody([textDelta], new TypeError("Load failed")), { status: 200 });
    renderPage();
    await sendMessage("What should I run?");

    expect(await screen.findByText("Run easy today.")).toBeInTheDocument();
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("keeps checking while the turn is still running after the connection drops", async () => {
    serverMessages = [USER_MSG];
    chatResponse = async () => {
      turnStatus = runningTurn();
      return new Response(sseBody([], new TypeError("Load failed")), { status: 200 });
    };
    renderPage();
    await sendMessage("What should I run?");
    await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());

    turnStatus = doneTurn;
    serverMessages = [USER_MSG, FINISHED_REPLY];
    expect(await screen.findByText("Run easy today.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(alertMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("textbox")).not.toBeDisabled());
  });

  it("recovers when a stream ends without a final event", async () => {
    serverMessages = [USER_MSG, FINISHED_REPLY];
    chatResponse = async () => new Response(sseBody([textDelta]), { status: 200 });
    renderPage();
    await sendMessage("What should I run?");

    expect(await screen.findByText("Run easy today.")).toBeInTheDocument();
    expect(screen.queryByText("Partial reply")).not.toBeInTheDocument();
  });

  it("says the coach is unreachable when a message never got through", async () => {
    chatResponse = async () => {
      throw new TypeError("Failed to fetch");
    };
    renderPage();
    await sendMessage("Hello coach");

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith(COACH_UNREACHABLE_MESSAGE), {
      timeout: 4000,
    });
    expect(callsTo("/api/coach/chat")).toBe(2);
    expect(screen.queryByText("Hello coach")).not.toBeInTheDocument();
  });

  it("quietly re-sends a message whose first request was dropped", async () => {
    const done = sse({ type: "done", message_id: "m2" });
    let attempts = 0;
    chatResponse = async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("Load failed");
      serverMessages = [USER_MSG, FINISHED_REPLY];
      return new Response(sseBody([done]), { status: 200 });
    };
    renderPage();
    await sendMessage("What should I run?");

    expect(await screen.findByText("Run easy today.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(attempts).toBe(2);
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("follows the reply already under way when the dropped request did arrive", async () => {
    serverMessages = [USER_MSG];
    let attempts = 0;
    chatResponse = async () => {
      attempts += 1;
      if (attempts === 1) {
        turnStatus = runningTurn();
        throw new TypeError("Load failed");
      }
      return new Response(JSON.stringify({ error: "a reply is already in progress" }), {
        status: 409,
      });
    };
    renderPage();
    await sendMessage("What should I run?");
    await waitFor(() => expect(attempts).toBe(2), { timeout: 4000 });
    await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());

    turnStatus = doneTurn;
    serverMessages = [USER_MSG, FINISHED_REPLY];
    expect(await screen.findByText("Run easy today.", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(alertMock).not.toHaveBeenCalled();
  }, 15000);

  it("still shows the coach's own error message", async () => {
    const errorEvent = `event: error\ndata: ${JSON.stringify({ type: "error", error: "Too long" })}\n\n`;
    chatResponse = async () => new Response(sseBody([errorEvent]), { status: 200 });
    renderPage();
    await sendMessage("Hello coach");

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith("Too long"));
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  it("re-checks and refreshes when the app returns to the foreground", async () => {
    serverMessages = [USER_MSG];
    renderPage([USER_MSG]);
    await waitFor(() => expect(callsTo("/api/coach/messages")).toBe(1));

    serverMessages = [USER_MSG, FINISHED_REPLY];
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(await screen.findByText("Run easy today.")).toBeInTheDocument();
  });

  it("tells the athlete once when a turn was cut off, and shows what was saved", async () => {
    turnStatus = {
      status: "running",
      error_message: null,
      started_at: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
    };
    serverMessages = [USER_MSG];
    renderPage();

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith(TURN_CUT_OFF_MESSAGE));
    expect(await screen.findByText("What should I run?")).toBeInTheDocument();

    // The server has now closed the row, so a later return stays quiet.
    turnStatus = { status: "error", error_message: TURN_CUT_OFF_MESSAGE, started_at: "2026-11-04T12:00:00Z" };
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(callsTo("/api/coach/turn-status")).toBe(2));
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  it("unlocks the message box when the first status check fails", async () => {
    turnStatus = new TypeError("Failed to fetch");
    renderPage();
    const input = await screen.findByRole("textbox");
    await waitFor(() => expect(input).not.toBeDisabled());
  });
});
