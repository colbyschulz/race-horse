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
- For each interval and its rest, set display_unit to match how the source plan expressed the distance: "m" for metre distances (400m, 800m, 1600m), "km" for kilometre distances (1km, 5km, 10km), "mi" for mile distances (1 mile, half mile, 2 miles). Never convert — preserve the original expression.

Pace extraction (CRITICAL — extract exactly, do not approximate):
- Always store pace as seconds_per_km, regardless of how the plan expresses it.
- If the plan gives pace in min:sec per mile, convert precisely: total_seconds_per_mile × (1000 ÷ 1609.344). Examples: 5:00/mi = 300 × 0.6214 = 186 s/km; 5:25/mi = 325 × 0.6214 = 202 s/km; 5:30/mi = 330 × 0.6214 = 205 s/km; 6:00/mi = 360 × 0.6214 = 224 s/km.
- If the plan gives pace in min:sec per km, convert to total seconds only: 4:30/km = 270 s/km.
- Extract the exact values stated — do not infer or adjust based on workout type.
- min_seconds_per_km = the faster (lower) pace; max_seconds_per_km = the slower (higher) pace.

Interval structure (CRITICAL):
- Set \`distance_m\` for distance-based intervals (400m, 1km, 1 mile). Set \`duration_s\` for time-based intervals (30sec, 2min, 90sec). NEVER set both on the same interval — they are mutually exclusive.
- If the plan notes a per-rep expected time alongside a distance (e.g. "1000m (3:01–3:05 per rep)"), that is context only — ignore it. Only set \`distance_m\`.
- Convert all durations to exact seconds including seconds: 30sec = 30, 90sec = 90, 2min = 120, 2:45 = 165, 3:01 = 181. Never drop the seconds portion.

Interval rest (CRITICAL — duration vs distance):
- Use \`rest.duration_s\` when rest is expressed as a time: "3 min jog", "90 sec", "2:45 jog", "3m recovery" where m = minutes. Convert precisely including seconds: 2:45 = 165, 3:01 = 181.
- Use \`rest.distance_m\` only when rest is expressed as a distance: "200m jog recovery", "400 meter walk".
- NEVER interpret a time abbreviation ("3m", "3min", "2:45") as metres.
- Set \`rest.type\` to a short label describing the recovery activity as written in the plan (e.g. "jog", "walk", "easy jog", "float", "rest"). Use whatever term the plan uses.`;

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
