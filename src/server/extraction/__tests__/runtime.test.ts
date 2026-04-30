// src/extraction/__tests__/runtime.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getPlanFileById,
  updatePlanFileStatus,
  setExtractedPayload,
  fetchPlanFileBytes,
  formatForClaude,
  messagesParse,
  getAnthropic,
} = vi.hoisted(() => {
  const messagesParse = vi.fn();
  return {
    getPlanFileById: vi.fn(),
    updatePlanFileStatus: vi.fn(),
    setExtractedPayload: vi.fn(),
    fetchPlanFileBytes: vi.fn(),
    formatForClaude: vi.fn(),
    messagesParse,
    getAnthropic: vi.fn(() => ({ messages: { parse: messagesParse } })),
  };
});

vi.mock("@/server/plans/files", () => ({
  getPlanFileById,
  updatePlanFileStatus,
  setExtractedPayload,
}));
vi.mock("../blob", () => ({ fetchPlanFileBytes }));
vi.mock("../format", () => ({ formatForClaude }));
vi.mock("@/server/coach/anthropic", () => ({
  getAnthropic,
  COACH_MODEL: "claude-sonnet-4-6",
  EXTRACTION_MODEL: "claude-sonnet-4-6",
}));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: vi.fn(() => ({})),
}));

import { runExtraction } from "../runtime";

const validPayload = {
  is_training_plan: true,
  title: "Test Plan",
  sport: "run",
  mode: "goal",
  goal: { race_date: null, race_distance: null, target_time: null },
  tentative_start_date: null,
  workouts: [
    {
      day_offset: 0,
      sport: "run",
      type: "easy",
      distance_meters: 5000,
      duration_seconds: null,
      target_intensity: null,
      intervals: null,
      notes: "",
    },
  ],
};

describe("runExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPlanFileById.mockResolvedValue({
      id: "f1",
      userId: "u1",
      status: "extracting",
      blob_url: "https://blob/x",
      original_filename: "plan.pdf",
      mime_type: "application/pdf",
    });
    fetchPlanFileBytes.mockResolvedValue(new ArrayBuffer(8));
    formatForClaude.mockResolvedValue([{ type: "text", text: "x" }]);
  });

  it("writes extracted_payload on success", async () => {
    messagesParse.mockResolvedValue({ parsed_output: validPayload });
    await runExtraction("f1", "u1");
    expect(setExtractedPayload).toHaveBeenCalledWith("f1", "u1", validPayload);
  });

  it("marks failed when is_training_plan=false", async () => {
    messagesParse.mockResolvedValue({
      parsed_output: { ...validPayload, is_training_plan: false },
    });
    await runExtraction("f1", "u1");
    expect(updatePlanFileStatus).toHaveBeenCalledWith(
      "f1",
      "u1",
      "failed",
      expect.stringMatching(/training plan/i)
    );
  });

  it("marks failed on Anthropic error", async () => {
    messagesParse.mockRejectedValue(new Error("network"));
    await runExtraction("f1", "u1");
    expect(updatePlanFileStatus).toHaveBeenCalledWith(
      "f1",
      "u1",
      "failed",
      expect.stringContaining("network")
    );
  });

  it("marks failed on schema mismatch", async () => {
    messagesParse.mockResolvedValue({
      parsed_output: { is_training_plan: true /* missing fields */ },
    });
    await runExtraction("f1", "u1");
    expect(updatePlanFileStatus).toHaveBeenCalledWith("f1", "u1", "failed", expect.any(String));
  });

  it("returns silently if row is missing or already terminal", async () => {
    getPlanFileById.mockResolvedValueOnce(null);
    await runExtraction("f1", "u1");
    expect(messagesParse).not.toHaveBeenCalled();
  });
});
