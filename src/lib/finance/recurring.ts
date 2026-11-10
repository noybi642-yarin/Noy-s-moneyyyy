import { CYCLE_START_DAY, cycleKeyFor, CycleKey, cycleKeysBetween, getCycle, shiftCycleKey } from "../cycle";
import { addMonthsYM, clampedDate, ISODate, parseISODate } from "../dates";
import { ChangeSet, emptyChangeSet, RecurringOccurrence, RecurringRule, Snapshot } from "../types";

export function occurrenceId(ruleId: string, cycle: CycleKey): string {
  return `occ:${ruleId}:${cycle}`;
}

/**
 * The due date of a monthly rule inside a budget cycle [2nd, next 2nd).
 * Day 2..31 falls in the cycle's starting month (clamped to month length);
 * day 1 falls in the following month (the last day of the cycle).
 */
export function dueDateInCycle(dayOfMonth: number, cycle: CycleKey): ISODate {
  const { y, m } = parseISODate(cycle);
  if (dayOfMonth >= CYCLE_START_DAY) return clampedDate(y, m, dayOfMonth);
  const n = addMonthsYM(y, m, 1);
  return clampedDate(n.y, n.m, dayOfMonth);
}

export function ruleAppliesInCycle(rule: RecurringRule, cycle: CycleKey): boolean {
  if (!rule.active) return false;
  const due = dueDateInCycle(rule.day_of_month, cycle);
  if (due < rule.start_date) return false;
  if (rule.end_date && due > rule.end_date) return false;
  return true;
}

/** How far back / forward occurrences are generated relative to the current cycle. */
export const RECURRING_LOOKBACK_CYCLES = 6;
export const RECURRING_LOOKAHEAD_CYCLES = 2;

function expectedOccurrence(rule: RecurringRule, cycle: CycleKey): RecurringOccurrence {
  return {
    id: occurrenceId(rule.id, cycle),
    rule_id: rule.id,
    cycle_start: cycle,
    due_date: dueDateInCycle(rule.day_of_month, cycle),
    amount: rule.amount,
    status: "expected",
    expense_id: null,
    is_overridden: false,
  };
}

function generationWindow(rule: RecurringRule, today: ISODate): CycleKey[] {
  const current = cycleKeyFor(today);
  let from = shiftCycleKey(current, -RECURRING_LOOKBACK_CYCLES);
  const ruleStart = cycleKeyFor(rule.start_date);
  if (ruleStart > from) from = ruleStart;
  const to = shiftCycleKey(current, RECURRING_LOOKAHEAD_CYCLES);
  if (from > to) return [];
  return cycleKeysBetween(from, to);
}

/**
 * Create the missing occurrences for every active rule. Occurrence ids are deterministic
 * (rule + cycle), and existing occurrences are never touched, so running this any number
 * of times never creates duplicates.
 */
export function generateOccurrences(snap: Snapshot, today: ISODate): ChangeSet {
  const cs = emptyChangeSet();
  const existing = new Set(snap.recurring_occurrences.map((o) => o.id));
  const created: RecurringOccurrence[] = [];
  for (const rule of snap.recurring_rules) {
    if (!rule.active) continue;
    for (const cycle of generationWindow(rule, today)) {
      const id = occurrenceId(rule.id, cycle);
      if (existing.has(id) || !ruleAppliesInCycle(rule, cycle)) continue;
      created.push(expectedOccurrence(rule, cycle));
      existing.add(id);
    }
  }
  if (created.length) cs.upsert.recurring_occurrences = created;
  return cs;
}

/**
 * After a rule is edited: update or remove its *future, unconfirmed, non-overridden*
 * occurrences (from the current cycle on), then create any missing ones.
 * Confirmed occurrences, skipped ones and individually edited ones are left as they are,
 * so history never changes.
 */
export function resyncRuleOccurrences(snap: Snapshot, rule: RecurringRule, today: ISODate): ChangeSet {
  const cs = emptyChangeSet();
  const current = cycleKeyFor(today);
  const updates: RecurringOccurrence[] = [];
  const deletes: string[] = [];
  for (const occ of snap.recurring_occurrences) {
    if (occ.rule_id !== rule.id || occ.status !== "expected" || occ.is_overridden) continue;
    if (occ.cycle_start < current) continue;
    if (!ruleAppliesInCycle(rule, occ.cycle_start)) {
      deletes.push(occ.id);
      continue;
    }
    const fresh = expectedOccurrence(rule, occ.cycle_start);
    if (fresh.amount !== occ.amount || fresh.due_date !== occ.due_date) updates.push(fresh);
  }
  const gen = generateOccurrences(
    {
      ...snap,
      recurring_rules: [rule],
      recurring_occurrences: snap.recurring_occurrences.filter((o) => !deletes.includes(o.id)),
    },
    today,
  );
  updates.push(...(gen.upsert.recurring_occurrences ?? []));
  if (updates.length) cs.upsert.recurring_occurrences = updates;
  if (deletes.length) cs.delete.recurring_occurrences = deletes;
  return cs;
}

export function occurrencesForCycle(snap: Snapshot, cycle: CycleKey): RecurringOccurrence[] {
  const c = getCycle(cycle);
  return snap.recurring_occurrences
    .filter((o) => o.cycle_start === c.key)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
}

/** Unconfirmed occurrences whose due date has already passed. */
export function overdueOccurrences(snap: Snapshot, today: ISODate): RecurringOccurrence[] {
  return snap.recurring_occurrences
    .filter((o) => o.status === "expected" && o.due_date <= today)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
}
