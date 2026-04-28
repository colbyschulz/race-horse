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

export const COACH_MODEL = "claude-sonnet-4-6";
export const COACH_BUILD_MODEL = "claude-sonnet-4-6";
export const EXTRACTION_MODEL = "claude-sonnet-4-6";
