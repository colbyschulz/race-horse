export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value);
}

export function todayIso(timezone?: string): string {
  if (!timezone || timezone === "UTC") {
    return new Date().toISOString().slice(0, 10);
  }
  // en-CA locale returns YYYY-MM-DD format
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

export function parseIso(iso: string): string {
  return iso;
}

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoFromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoFromUtcDate(d);
}

export function mondayOf(iso: string): string {
  const d = toUtcDate(iso);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return isoFromUtcDate(d);
}

const SHORT_MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const LONG_MONTH = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SHORT_WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatWeekLabel(monday: string): string {
  const start = toUtcDate(monday);
  const end = toUtcDate(addDays(monday, 6));
  const startStr = `${SHORT_MONTH[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const endStr =
    start.getUTCMonth() === end.getUTCMonth()
      ? `${end.getUTCDate()}`
      : `${SHORT_MONTH[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${startStr}–${endStr}`;
}

export function formatDayLabel(iso: string): string {
  const d = toUtcDate(iso);
  return `${SHORT_WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export function formatLongDate(iso: string): string {
  const d = toUtcDate(iso);
  return `${LONG_WEEKDAY[d.getUTCDay()]}, ${LONG_MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// "Apr 27"
export function formatDateShort(iso: string): string {
  const d = toUtcDate(iso);
  return `${SHORT_MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// "Apr 27, 2026"
export function formatDateMedium(iso: string): string {
  const d = toUtcDate(iso);
  return `${SHORT_MONTH[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// "Apr 27, 2026 – May 30, 2026" or "Apr 27, 2026 · ongoing" when end is null.
export function formatDateRange(start: string, end: string | null): string {
  return end
    ? `${formatDateMedium(start)} – ${formatDateMedium(end)}`
    : `${formatDateMedium(start)} · ongoing`;
}

// 1-indexed week number relative to the plan's first Monday.
export function weekIndexFromStart(planStart: string, monday: string): number {
  const startMon = mondayOf(planStart);
  const ms = toUtcDate(monday).getTime() - toUtcDate(startMon).getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
}
