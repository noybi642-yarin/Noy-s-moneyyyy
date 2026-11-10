import {
  addMonthsYM,
  diffDays,
  hebrewMonthName,
  hebrewMonthShort,
  ISODate,
  parseISODate,
  toISODate,
  addDays,
} from "./dates";

/**
 * Budget cycle: starts at the beginning of the 2nd of each month and ends immediately
 * before the 2nd of the following month — the half-open interval [start, nextStart).
 * A cycle is identified by its start date, e.g. "2026-11-02" (November cycle).
 */
export const CYCLE_START_DAY = 2;

export type CycleKey = ISODate; // the cycle's start date

export interface Cycle {
  key: CycleKey;
  start: ISODate; // inclusive
  endExclusive: ISODate; // exclusive (start of the next cycle)
  lastDay: ISODate; // inclusive last calendar day
  year: number;
  month: number; // month in which the cycle starts
  totalDays: number;
}

export function cycleKeyFor(date: ISODate, startDay = CYCLE_START_DAY): CycleKey {
  const { y, m, d } = parseISODate(date);
  if (d >= startDay) return toISODate({ y, m, d: startDay });
  const prev = addMonthsYM(y, m, -1);
  return toISODate({ y: prev.y, m: prev.m, d: startDay });
}

export function shiftCycleKey(key: CycleKey, delta: number): CycleKey {
  const { y, m, d } = parseISODate(key);
  const n = addMonthsYM(y, m, delta);
  return toISODate({ y: n.y, m: n.m, d });
}

export function getCycle(key: CycleKey): Cycle {
  const { y, m } = parseISODate(key);
  const endExclusive = shiftCycleKey(key, 1);
  return {
    key,
    start: key,
    endExclusive,
    lastDay: addDays(endExclusive, -1),
    year: y,
    month: m,
    totalDays: diffDays(key, endExclusive),
  };
}

export function cycleFor(date: ISODate): Cycle {
  return getCycle(cycleKeyFor(date));
}

export function isInCycle(date: ISODate, cycle: Cycle): boolean {
  return date >= cycle.start && date < cycle.endExclusive;
}

/** Number of whole cycles between a and b (b - a). */
export function cycleDistance(a: CycleKey, b: CycleKey): number {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  return (pb.y - pa.y) * 12 + (pb.m - pa.m);
}

/** Days elapsed including today, and days remaining including today. */
export function cycleProgress(cycle: Cycle, today: ISODate) {
  if (today < cycle.start) {
    return { elapsedDays: 0, remainingDays: cycle.totalDays, fraction: 0, status: "future" as const };
  }
  if (today >= cycle.endExclusive) {
    return { elapsedDays: cycle.totalDays, remainingDays: 0, fraction: 1, status: "past" as const };
  }
  const elapsedDays = diffDays(cycle.start, today) + 1;
  return {
    elapsedDays,
    remainingDays: diffDays(today, cycle.endExclusive),
    fraction: elapsedDays / cycle.totalDays,
    status: "current" as const,
  };
}

/** "מחזור נובמבר 2026" */
export function cycleLabel(key: CycleKey): string {
  const { y, m } = parseISODate(key);
  return `${hebrewMonthName(m)} ${y}`;
}

export function cycleShortLabel(key: CycleKey): string {
  const { m, y } = parseISODate(key);
  return `${hebrewMonthShort(m)} ${String(y).slice(2)}`;
}

/** "2.11 – 1.12" */
export function cycleRangeLabel(key: CycleKey): string {
  const c = getCycle(key);
  const s = parseISODate(c.start);
  const e = parseISODate(c.lastDay);
  return `${s.d}.${s.m} – ${e.d}.${e.m}`;
}

export function cycleKeysBetween(from: CycleKey, to: CycleKey): CycleKey[] {
  const out: CycleKey[] = [];
  const n = cycleDistance(from, to);
  for (let i = 0; i <= n; i++) out.push(shiftCycleKey(from, i));
  return out;
}
