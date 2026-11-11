const MS_PER_DAY = 86_400_000;

function parseISODate(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function computeWeeksLeft(endDate: string | null, today: string): number | null {
  if (!endDate) return null;
  const end = parseISODate(endDate).getTime();
  const now = parseISODate(today).getTime();
  const days = Math.ceil((end - now) / MS_PER_DAY);
  return Math.max(0, Math.ceil(days / 7));
}

export function formatDuration(startDate: string, endDate: string | null): string {
  if (!endDate) return "indefinite";
  const start = parseISODate(startDate).getTime();
  const end = parseISODate(endDate).getTime();
  const weeks = Math.round((end - start) / (MS_PER_DAY * 7));
  return `${weeks} weeks`;
}
