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
- Doubles (two-a-days): if a day has two distinct sessions (e.g. "AM: 8mi easy. PM: 3mi shakeout"), use the primary workout for the main session and populate \`secondary\` for the second. Set \`secondary.distance_meters\` and/or \`secondary.duration_seconds\` and put any description in \`secondary.notes\`. If the day has only one session, set \`secondary: null\`.

Interval workout notes (CRITICAL — include every element the plan states):
When type is "intervals", the \`notes\` field must be a complete, human-readable prescription. Include all of the following that the source plan provides:
- Reps × distance or time (e.g. "6 × 1 km" or "8 × 400 m")
- Target pace expressed as written in the source (e.g. "@ 5:00/mile" or "@ 3:45/km")
- Rep time — derive from distance × pace if not stated (e.g. "≈ 75 sec per rep")
- Rest period — exact time or rule (e.g. "90 sec standing rest" or "jog 200 m recovery")
- Warm-up and cool-down if the plan specifies them
- Any other coaching cues the plan includes (stride focus, effort description, etc.)
Do not abbreviate or paraphrase. Copy the full prescription into notes even if it is long.

Pace extraction (CRITICAL — extract exactly, do not approximate):
- Always store pace as seconds_per_km, regardless of how the plan expresses it.
- If the plan gives pace in min:sec per mile, convert precisely: total_seconds_per_mile × (1000 ÷ 1609.344). Examples: 5:00/mi = 300 × 0.6214 = 186 s/km; 5:25/mi = 325 × 0.6214 = 202 s/km; 5:30/mi = 330 × 0.6214 = 205 s/km; 6:00/mi = 360 × 0.6214 = 224 s/km.
- If the plan gives pace in min:sec per km, convert to total seconds only: 4:30/km = 270 s/km.
- Extract the exact values stated — do not infer or adjust based on workout type.
- min_seconds_per_km = the faster (lower) pace; max_seconds_per_km = the slower (higher) pace.

General notes extraction:
The \`notes\` field for every workout should capture the full coaching intent — not just the headline metric. Include effort descriptions, form cues, purpose statements, and any other detail the plan author wrote for that day. Do not truncate.`;

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
