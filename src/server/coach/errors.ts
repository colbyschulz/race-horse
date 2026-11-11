// What the athlete is told when a coach turn fails. Only messages written for
// them are passed through; anything else (a database error, an SDK error) is
// replaced, because its text is for the server log, not the screen.

/** An error whose message is written for the athlete and safe to show as is. */
export class CoachUserError extends Error {}

export const COACH_FAILED_MESSAGE =
  "Something went wrong on our end and the coach couldn't finish that reply. Anything it already saved is still in your plan. Try sending your message again.";

export const COACH_BUSY_MESSAGE =
  "The coach is busy right now. Give it a minute and try again.";

// Rate limited, overloaded or temporarily unavailable at the model provider.
const BUSY_STATUSES = new Set([429, 503, 529]);

export function athleteMessage(err: unknown): string {
  if (err instanceof CoachUserError) return err.message;
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && BUSY_STATUSES.has(status)) return COACH_BUSY_MESSAGE;
  return COACH_FAILED_MESSAGE;
}
