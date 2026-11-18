// The title a session gets on Today and in the workout sheet. It names the
// sport where the type alone would be ambiguous, so a ride scheduled inside a
// run plan reads as a ride.
const RUN_HEADLINE: Record<string, string> = {
  easy: "Easy Run",
  long: "Long Run",
  tempo: "Tempo Run",
  threshold: "Threshold",
  intervals: "Intervals",
  recovery: "Recovery",
  race: "Race Day",
  rest: "Rest",
};

const BIKE_HEADLINE: Record<string, string> = {
  ...RUN_HEADLINE,
  easy: "Easy Ride",
  long: "Long Ride",
  tempo: "Tempo Ride",
  threshold: "Threshold Ride",
  intervals: "Interval Ride",
  recovery: "Recovery Ride",
};

export function workoutHeadline(type: string, sport: string): string {
  return (sport === "bike" ? BIKE_HEADLINE : RUN_HEADLINE)[type] ?? type;
}

/** Rest days have no session, so they get no sport icon. */
export function hasSportIcon(type: string): boolean {
  return type !== "rest";
}
