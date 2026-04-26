export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

const SHORT_MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const LONG_MONTH = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT_WEEKDAY = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const LONG_WEEKDAY = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

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
