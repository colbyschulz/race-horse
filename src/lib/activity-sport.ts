export type Sport = "run" | "bike";

// Strava's sport types, lowercased. Anything not listed here (walks, hikes,
// swims, strength, yoga) is neither, so it never adds to running or riding
// mileage.
const RUN_TYPES = new Set(["run", "trailrun", "virtualrun"]);
const BIKE_TYPES = new Set([
  "ride",
  "virtualride",
  "ebikeride",
  "gravelride",
  "mountainbikeride",
  "emountainbikeride",
  "velomobile",
  "handcycle",
]);

/** Which of the app's two sports a Strava activity counts toward, if either. */
export function activitySport(stravaType: string): Sport | null {
  const t = stravaType.toLowerCase();
  if (RUN_TYPES.has(t)) return "run";
  if (BIKE_TYPES.has(t)) return "bike";
  return null;
}
