import { z } from "zod";

export const PreferencesSchema = z.object({
  units: z.enum(["mi", "km"]),
  timezone: z.string().min(1),
  pace_format: z.enum(["min_per_mi", "min_per_km"]),
  power_units: z.literal("watts"),
});

export type PreferencesPayload = z.infer<typeof PreferencesSchema>;
