import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SSEEvent } from "@/types/coach";

let capturedTask: Promise<unknown> | (() => unknown) | undefined;
vi.mock("next/server", () => ({
  after: (task: Promise<unknown> | (() => unknown)) => {
    capturedTask = task;
  },
}));

const mockUpsertTurnStatus = vi.fn();
vi.mock("@/server/coach/turn-status", () => ({
  upsertTurnStatus: (...args: unknown[]) => mockUpsertTurnStatus(...args),
}));

import { sseResponse } from "../sse-server";
import { COACH_FAILED_MESSAGE } from "@/server/coach/errors";

async function* gen(events: SSEEvent[]): AsyncGenerator<SSEEvent> {
  for (const e of events) yield e;
}

async function readAll(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value);
  }
  return out;
}

beforeEach(() => {
  capturedTask = undefined;
  mockUpsertTurnStatus.mockReset().mockResolvedValue(undefined);
});

describe("sseResponse", () => {
  it("streams encoded SSE events to a connected client", async () => {
    const res = sseResponse(
      gen([
        { type: "text-delta", delta: "hi" },
        { type: "done", message_id: "m1" },
      ])
    );
    const text = await readAll(res);
    expect(text).toContain("event: text-delta");
    expect(text).toContain('"delta":"hi"');
    expect(text).toContain("event: done");
  });

  it("marks the turn running then done when turnTracking is provided", async () => {
    const res = sseResponse(gen([{ type: "done", message_id: "m1" }]), { userId: "u1", planId: "p1" });
    await readAll(res);
    await capturedTask;
    expect(mockUpsertTurnStatus.mock.calls[0]).toEqual(["u1", "p1", "running", null]);
    expect(mockUpsertTurnStatus.mock.calls[1]).toEqual(["u1", "p1", "done", null]);
  });

  it("marks the turn as error when the generator yields an error event", async () => {
    const res = sseResponse(gen([{ type: "error", error: "boom" }]), { userId: "u1", planId: null });
    await readAll(res);
    await capturedTask;
    expect(mockUpsertTurnStatus).toHaveBeenCalledWith("u1", null, "error", "boom");
  });

  it("marks the turn as error if the generator ends without a done or error event", async () => {
    const res = sseResponse(gen([{ type: "text-delta", delta: "hi" }]), { userId: "u1", planId: "p1" });
    await readAll(res);
    await capturedTask;
    expect(mockUpsertTurnStatus).toHaveBeenLastCalledWith(
      "u1",
      "p1",
      "error",
      "Stream ended without completing"
    );
  });

  it("marks the turn as error when the generator throws instead of yielding an error event", async () => {
    async function* throwingGen(): AsyncGenerator<SSEEvent> {
      throw new Error("unexpected failure");
    }
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = sseResponse(throwingGen(), { userId: "u1", planId: "p1" });
    await readAll(res);
    await capturedTask;
    // The raw error is for the log; the athlete gets a message written for them.
    expect(mockUpsertTurnStatus).toHaveBeenLastCalledWith("u1", "p1", "error", COACH_FAILED_MESSAGE);
    expect(errorLog).toHaveBeenCalledWith(
      "coach stream failed",
      { userId: "u1", planId: "p1" },
      expect.objectContaining({ message: "unexpected failure" })
    );
  });

  it("keeps draining the generator to completion after the client cancels", async () => {
    let yielded = 0;
    async function* slowGen(): AsyncGenerator<SSEEvent> {
      yielded++;
      yield { type: "text-delta", delta: "a" };
      yielded++;
      yield { type: "done", message_id: "m1" };
    }
    const res = sseResponse(slowGen(), { userId: "u1", planId: "p1" });
    await res.body!.cancel();
    await capturedTask;
    expect(yielded).toBe(2);
    expect(mockUpsertTurnStatus).toHaveBeenCalledWith("u1", "p1", "done", null);
  });
});
