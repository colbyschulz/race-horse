// Pure helpers for turning an in-app route path into a human-readable label.
// Used by the coach context pill (client) and by the coach prompt builder (server).

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAN_DETAIL_RE = new RegExp(`^/plans/(${UUID})$`);
const WORKOUT_DETAIL_RE = new RegExp(`^/plans/(${UUID})/(\\d{4}-\\d{2}-\\d{2})$`);

const ROUTE_LABELS: Record<string, string> = {
  "/today": "Today view",
  "/training": "Training view (week agenda)",
  "/plans": "Plans / manage page",
  "/settings": "Settings page",
  "/coach": "Coach chat",
};

export function routeLabel(from: string | undefined | null): string | null {
  if (!from) return null;
  const wmatch = from.match(WORKOUT_DETAIL_RE);
  if (wmatch) {
    return `Workout detail (plan id: ${wmatch[1]}, date: ${wmatch[2]})`;
  }
  const pmatch = from.match(PLAN_DETAIL_RE);
  if (pmatch) {
    return `Plan detail (plan id: ${pmatch[1]})`;
  }
  return ROUTE_LABELS[from] ?? null;
}
