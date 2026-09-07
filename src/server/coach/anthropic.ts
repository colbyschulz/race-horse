import "server-only";

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 270_000 });
  }
  return client;
}

// Routing:
// - COACH_MODEL: everyday chat and small plan edits (single workout / single week).
// - COACH_BUILD_MODEL: cold-start plan builds (multi-week structure, highest stakes).
// - COACH_DEEP_MODEL: chat turns escalated by the coach via `request_deep_planning`
//   (multi-week restructures). Caches are per-model, so an escalation costs one
//   cold read of the history — acceptable because it's rare.
export const COACH_MODEL = "claude-sonnet-5";
export const COACH_BUILD_MODEL = "claude-opus-5";
export const COACH_DEEP_MODEL = "claude-opus-5";
export const EXTRACTION_MODEL = "claude-sonnet-5";

// Effort for the planning paths. Chat leaves effort at the model default (high).
export const COACH_BUILD_EFFORT = "high" as const;
export const COACH_DEEP_EFFORT = "high" as const;

// max_tokens is a hard cap on thinking + visible text. Streaming, so these can
// be generous without risking HTTP timeouts.
export const COACH_CHAT_MAX_TOKENS = 16_000;
export const COACH_BUILD_MAX_TOKENS = 32_000;
