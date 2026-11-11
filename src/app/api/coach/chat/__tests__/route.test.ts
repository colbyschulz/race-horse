import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});
const mockGetTurnStatus = vi.fn();
vi.mock("@/server/coach/turn-status", () => ({
  upsertTurnStatus: vi.fn().mockResolvedValue(undefined),
  getTurnStatus: (...args: unknown[]) => mockGetTurnStatus(...args),
}));

const mockAuth = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => mockAuth() }));

const mockRunCoach = vi.fn();
vi.mock("@/server/coach/runner", () => ({
  runCoach: (...args: unknown[]) => mockRunCoach(...args),
}));

import { POST } from "../route";

describe("POST /api/coach/chat", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockRunCoach.mockReset();
    mockGetTurnStatus.mockReset().mockResolvedValue(null);
  });

  it("returns 401 if not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request("http://test/api/coach/chat", {
      method: "POST",
      body: JSON.stringify({ message: "hello" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 if message is missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const req = new Request("http://test/api/coach/chat", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 if message is empty/whitespace", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const req = new Request("http://test/api/coach/chat", {
      method: "POST",
      body: JSON.stringify({ message: "   " }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("streams SSE events for valid request", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });

    async function* fakeEvents() {
      yield { type: "text-delta" as const, delta: "hello" };
      yield { type: "done" as const, message_id: "m1" };
    }
    mockRunCoach.mockReturnValue(fakeEvents());

    const req = new Request("http://test/api/coach/chat", {
      method: "POST",
      body: JSON.stringify({ message: "How am I doing?" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const text = await res.text();
    expect(text).toContain("event: text-delta\ndata: ");
    expect(text).toContain(JSON.stringify({ type: "text-delta", delta: "hello" }));
    expect(text).toContain("event: done\ndata: ");
    expect(text).toContain(JSON.stringify({ type: "done", message_id: "m1" }));
  });

  it("refuses a second message while a reply is still in progress", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetTurnStatus.mockResolvedValue({
      status: "running",
      error_message: null,
      started_at: new Date(),
    });
    const req = new Request("http://test/api/coach/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Are you there?", plan_id: "p1" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
    expect(mockGetTurnStatus).toHaveBeenCalledWith("u1", "p1");
    expect(mockRunCoach).not.toHaveBeenCalled();
  });

  it("accepts a message when the earlier reply was cut off long ago", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetTurnStatus.mockResolvedValue({
      status: "running",
      error_message: null,
      started_at: new Date(Date.now() - 60 * 60 * 1000),
    });
    mockRunCoach.mockReturnValue((async function* () {})());
    const req = new Request("http://test/api/coach/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Try again" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockRunCoach).toHaveBeenCalledTimes(1);
  });
});
