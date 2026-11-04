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
//   (multi-week restructures). Matches chat's model and effort so escalating
//   neither lowers quality nor breaks the messages cache.
export const COACH_MODEL = "claude-opus-5-5";
export const COACH_BUILD_MODEL = "claude-opus-5-5";
export const COACH_DEEP_MODEL = "claude-opus-5-5";
export const EXTRACTION_MODEL = "claude-sonnet-5";

// Effort is set explicitly because Opus 5.5 defaults to medium. Chat runs at
// xhigh because coaching decisions were measurably better there (see
// docs/coach-prompt-rewrite.md). Builds stay at high: both efforts passed the
// plan tests, and xhigh cost about twice as much with less room under the
// platform's 300-second limit.
export const COACH_CHAT_EFFORT = "xhigh" as const;
export const COACH_BUILD_EFFORT = "high" as const;
export const COACH_DEEP_EFFORT = "xhigh" as const;

// max_tokens is a hard cap on thinking + visible text. Streaming, so these can
// be generous without risking HTTP timeouts.
export const COACH_CHAT_MAX_TOKENS = 32_000;
export const COACH_BUILD_MAX_TOKENS = 32_000;
