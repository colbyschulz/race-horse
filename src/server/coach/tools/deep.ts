import "server-only";

import type { Anthropic } from "@anthropic-ai/sdk";
import type { ToolHandler } from "../types";

type Tool = Anthropic.Messages.Tool;

/**
 * Escalation hatch. Everyday chat runs on the lighter chat model. When the
 * coach decides a request is really a multi-week restructure (injury, a
 * missed block, a moved race, a change to the plan's arc), it calls this tool
 * and the runner switches the rest of this turn — and the athlete's next turn —
 * to the deep planning model.
 */
export const requestDeepPlanningTool: Tool = {
  name: "request_deep_planning",
  description:
    "Switch this conversation to the deep-planning model for the rest of this turn and the athlete's next turn. Call it BEFORE reading the plan or writing any workouts when the request is a multi-week restructure: rebuilding 3+ weeks, changing the plan's arc or peak, re-planning after injury/illness/a missed block, or moving the goal race. Do not call it for single-workout or single-week edits — those are handled directly. Returns immediately; continue working after it returns.",
  input_schema: {
    type: "object" as const,
    properties: {
      reason: {
        type: "string",
        description:
          "One line: why this needs deep planning (e.g. 'rebuild weeks 6–12 after calf strain').",
      },
    },
    required: ["reason"],
    additionalProperties: false,
  },
};

export const request_deep_planning_handler: ToolHandler<
  { reason: string },
  { ok: true; note: string }
> = async () => {
  return {
    ok: true,
    note: "Deep planning mode is active for the rest of this turn and the athlete's next turn. Read the affected weeks with get_plan (pass from/to), then proceed.",
  };
};
