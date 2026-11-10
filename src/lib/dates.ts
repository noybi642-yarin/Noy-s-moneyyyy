/**
 * Calendar-date helpers.
 *
 * All financial dates are plain calendar dates ("YYYY-MM-DD") interpreted in the
 * Asia/Jerusalem timezone. Arithmetic is done on the calendar (year, month, day)
 * triple, so DST transitions and the host machine's timezone can never shift a date.
 * The only place a real instant is converted is `todayInJerusalem`.
 */
export type ISODate = string; // YYYY-MM-DD

export const APP_TIMEZONE = "Asia/Jerusalem";

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export function parseISODate(s: ISODate): YMD {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid ISO date: ${s}`);
  const ymd = { y: +m[1], m: +m[2], d: +m[3] };
  if (ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.d > daysInMonth(ymd.y, ymd.m)) {
    throw new Error(`Invalid calendar date: ${s}`);
  }
  return ymd;
}

export function isValidISODate(s: string): boolean {
  try {
    parseISODate(s);
    return true;
  } catch {
    return false;
  }
}

export function toISODate({ y, m, d }: YMD): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Add months to a (year, month) pair. */
export function addMonthsYM(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** Build a date in a given month, clamping the day to the month length (31 -> 30/28/29). */
export function clampedDate(y: number, m: number, day: number): ISODate {
  return toISODate({ y, m, d: Math.min(day, daysInMonth(y, m)) });
}

/** Days since 1970-01-01 for a calendar date (UTC-based, timezone independent). */
export function dayNumber(s: ISODate): number {
  const { y, m, d } = parseISODate(s);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): ISODate {
  const dt = new Date(n * 86_400_000);
  return toISODate({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function addDays(s: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(s) + days);
}

/** b - a in days */
export function diffDays(a: ISODate, b: ISODate): number {
  return dayNumber(b) - dayNumber(a);
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

/** The current calendar date in Asia/Jerusalem for a given instant. */
export function todayInJerusalem(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Day of week (0 = Sunday) of a calendar date. */
export function dayOfWeek(s: ISODate): number {
  const { y, m, d } = parseISODate(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const HE_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
const HE_MONTHS_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function hebrewMonthName(m: number): string {
  return HE_MONTHS[m - 1];
}

export function hebrewMonthShort(m: number): string {
  return HE_MONTHS_SHORT[m - 1];
}

export function hebrewDayName(s: ISODate): string {
  return HE_DAYS[dayOfWeek(s)];
}

/** "10 בנובמבר" */
export function formatDayMonth(s: ISODate): string {
  const { m, d } = parseISODate(s);
  return `${d} ב${HE_MONTHS[m - 1]}`;
}

/** "10.11.26" */
export function formatShortDate(s: ISODate): string {
  const { y, m, d } = parseISODate(s);
  return `${d}.${m}.${String(y).slice(2)}`;
}

/** "10.11" */
export function formatDM(s: ISODate): string {
  const { m, d } = parseISODate(s);
  return `${d}.${m}`;
}
