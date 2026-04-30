// src/extraction/schema.ts
import { z } from "zod";

const TargetIntensityZ = z.object({
  pace: z
    .object({
      min_seconds_per_km: z.number().optional(),
      max_seconds_per_km: z.number().optional(),
    })
    .optional(),
  power: z
    .object({
      min_watts: z.number().optional(),
      max_watts: z.number().optional(),
    })
    .optional(),
  hr: z
    .union([
      z.object({ min_bpm: z.number().optional(), max_bpm: z.number().optional() }),
      z.object({ zone: z.string() }),
    ])
    .optional(),
  rpe: z.number().optional(),
});

const IntervalSpecZ = z.object({
  reps: z.number().int().positive(),
  distance_m: z.number().optional(),
  duration_s: z.number().optional(),
  target_intensity: TargetIntensityZ.optional(),
  rest: z
    .object({
      duration_s: z.number().optional(),
      distance_m: z.number().optional(),
    })
    .optional(),
});

const WorkoutTypeZ = z.enum([
  "easy",
  "long",
  "tempo",
  "threshold",
  "intervals",
  "recovery",
  "race",
  "rest",
  "cross",
]);

export const ExtractedPlanSchema = z.object({
  is_training_plan: z.boolean(),
  title: z.string(),
  sport: z.enum(["run", "bike"]),
  mode: z.enum(["goal", "indefinite"]),
  goal: z
    .object({
      race_date: z.string().nullable(),
      race_distance: z.string().nullable(),
      target_time: z.string().nullable(),
    })
    .nullable(),
  tentative_start_date: z.string().nullable(),
  workouts: z.array(
    z.object({
      day_offset: z.number().int().nonnegative(),
      sport: z.enum(["run", "bike"]),
      type: WorkoutTypeZ,
      distance_meters: z.number().nullable(),
      duration_seconds: z.number().int().nullable(),
      target_intensity: TargetIntensityZ.nullable(),
      intervals: z.array(IntervalSpecZ).nullable(),
      notes: z.string(),
    })
  ),
});

export type ExtractedPlan = z.infer<typeof ExtractedPlanSchema>;
