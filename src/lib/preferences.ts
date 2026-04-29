import { z } from "zod";

export const PreferencesSchema = z.object({
  units: z.enum(["mi", "km"]),
  timezone: z
    .string()
    .min(1)
    .refine(
      (tz) => {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Must be a valid IANA timezone" }
    ),
  pace_format: z.enum(["min_per_mi", "min_per_km"]),
  power_units: z.literal("watts"),
});

export type PreferencesPayload = z.infer<typeof PreferencesSchema>;
