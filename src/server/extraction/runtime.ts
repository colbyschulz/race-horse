// src/extraction/runtime.ts
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, EXTRACTION_MODEL } from "@/server/coach/anthropic";
import { getPlanFileById, setExtractedPayload, updatePlanFileStatus } from "@/server/plans/files";
import { fetchPlanFileBytes } from "./blob";
import { formatForClaude } from "./format";
import { ExtractedPlanSchema } from "./schema";

const EXTRACTION_SYSTEM_PROMPT = `You are a training-plan extractor.
Output a JSON object matching the provided schema. Do not invent dates.

Conventions:
- Express each workout's date as \`day_offset\` (0-indexed integer) from the plan's start.
- If the file uses absolute dates, calculate offsets from the earliest workout's date.
- If the file uses "Week N, Day M" notation, day_offset = (N-1)*7 + (M-1) where Day 1 = Monday.
- "tentative_start_date": YYYY-MM-DD if the file gave an explicit start (or earliest absolute workout date); otherwise null.
- Workout types: easy, long, tempo, threshold, intervals, recovery, race, rest, cross.
- target_intensity may include any of: pace (min/max seconds_per_km), power (min/max watts), hr (min/max bpm or {zone}), rpe (1-10).
- If this isn't a training plan, set is_training_plan: false and leave the rest as empty defaults: title="", sport="run", mode="indefinite", goal=null, tentative_start_date=null, workouts=[].
- For each interval and its rest, set display_unit to match how the source plan expressed the distance: "m" for metre distances (400m, 800m, 1600m), "km" for kilometre distances (1km, 5km, 10km), "mi" for mile distances (1 mile, half mile, 2 miles). Never convert — preserve the original expression.`;

export async function runExtraction(planFileId: string, userId: string): Promise<void> {
  const row = await getPlanFileById(planFileId, userId);
  if (!row || row.status !== "extracting") return;

  try {
    const buf = await fetchPlanFileBytes(row.blob_url);
    const content = await formatForClaude(buf, row.mime_type, row.original_filename);

    const client = getAnthropic();
    const response = await client.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 32000,
      system: [
        { type: "text", text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      output_config: {
        format: zodOutputFormat(ExtractedPlanSchema),
      },
      messages: [{ role: "user", content }],
    });

    const parsed = ExtractedPlanSchema.safeParse(response.parsed_output);
    if (!parsed.success) {
      await updatePlanFileStatus(
        planFileId,
        userId,
        "failed",
        "Couldn't parse the file's structure."
      );
      return;
    }

    if (!parsed.data.is_training_plan) {
      await updatePlanFileStatus(
        planFileId,
        userId,
        "failed",
        "This file doesn't look like a training plan."
      );
      return;
    }

    await setExtractedPayload(planFileId, userId, parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updatePlanFileStatus(planFileId, userId, "failed", msg);
  }
}
