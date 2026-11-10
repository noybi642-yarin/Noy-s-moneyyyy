import { cycleKeyFor, CycleKey, cycleLabel, cycleProgress, getCycle, shiftCycleKey } from "../cycle";
import { diffDays, ISODate } from "../dates";
import { Agorot, formatILS } from "../money";
import type { PaymentMethod, Settings, Snapshot } from "../types";
import { Allocation, allocations, budgetForCycle } from "./budget";

export interface CycleTotal {
  key: CycleKey;
  consumed: Agorot;
  budget: Agorot | null;
  recurring: Agorot;
  variable: Agorot;
  discretionary: Agorot;
  byCategory: Map<string, Agorot>;
  byMethod: Record<PaymentMethod, Agorot>;
}

export function cycleTotals(snap: Snapshot, all: Allocation[], keys: CycleKey[]): CycleTotal[] {
  const discretionary = new Set(snap.categories.filter((c) => c.is_discretionary).map((c) => c.id));
  return keys.map((key) => {
    const t: CycleTotal = {
      key,
      consumed: 0,
      budget: budgetForCycle(snap.budgets, key),
      recurring: 0,
      variable: 0,
      discretionary: 0,
      byCategory: new Map(),
      byMethod: { credit_card: 0, bank_transfer: 0, cash: 0 },
    };
    for (const a of all) {
      if (a.cycle !== key) continue;
      t.consumed += a.amount;
      if (a.expense.source === "recurring") t.recurring += a.amount;
      else t.variable += a.amount;
      if (discretionary.has(a.expense.category_id)) t.discretionary += a.amount;
      t.byCategory.set(a.expense.category_id, (t.byCategory.get(a.expense.category_id) ?? 0) + a.amount);
      t.byMethod[a.expense.payment_method] += a.amount;
    }
    return t;
  });
}

/**
 * Category totals of a cycle counting only what was allocated up to `dayOffset` days into
 * the cycle. Later installments of older purchases are fixed charges and count from day 0.
 * Used to compare the current (partial) cycle fairly with the same point last cycle.
 */
export function categoryTotalsToDay(all: Allocation[], key: CycleKey, dayOffset: number): Map<string, Agorot> {
  const map = new Map<string, Agorot>();
  for (const a of all) {
    if (a.cycle !== key) continue;
    const isFirst = a.installmentNumber === null || a.installmentNumber === 1;
    const offset = isFirst ? diffDays(key, a.expense.purchase_date) : 0;
    if (offset >= dayOffset) continue;
    map.set(a.expense.category_id, (map.get(a.expense.category_id) ?? 0) + a.amount);
  }
  return map;
}

export interface Insight {
  id: string;
  tone: "positive" | "neutral" | "attention";
  text: string;
}

const MIN_COMPARE_AGOROT = 15000; // ₪150 — below this, % changes are noise
const MIN_CHANGE_PCT = 20;

/** Concise Hebrew insights from real data only. Returns [] when there isn't enough data. */
export function generateInsights(snap: Snapshot, settings: Settings, today: ISODate): Insight[] {
  const out: Insight[] = [];
  if (snap.expenses.length < 3) return out;
  const all = allocations(snap, settings.accounting_policy);
  const current = cycleKeyFor(today);
  const prev = shiftCycleKey(current, -1);
  const progress = cycleProgress(getCycle(current), today);
  const catName = (id: string) => snap.categories.find((c) => c.id === id)?.name ?? "אחר";
  const hasPrevData = all.some((a) => a.cycle === prev);

  // 1) Same point in cycle, category comparison.
  if (hasPrevData && progress.elapsedDays >= 5) {
    const cur = categoryTotalsToDay(all, current, progress.elapsedDays);
    const before = categoryTotalsToDay(all, prev, progress.elapsedDays);
    const changes: { id: string; pct: number; cur: Agorot; prev: Agorot }[] = [];
    for (const [id, prevAmt] of before) {
      const curAmt = cur.get(id) ?? 0;
      if (prevAmt < MIN_COMPARE_AGOROT && curAmt < MIN_COMPARE_AGOROT) continue;
      if (prevAmt === 0) continue;
      const pct = Math.round(((curAmt - prevAmt) / prevAmt) * 100);
      if (Math.abs(pct) >= MIN_CHANGE_PCT) changes.push({ id, pct, cur: curAmt, prev: prevAmt });
    }
    changes.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    for (const c of changes.slice(0, 2)) {
      if (c.pct < 0) {
        out.push({
          id: `cmp-${c.id}`,
          tone: "positive",
          text: `עד היום במחזור הוצאת ${Math.abs(c.pct)}% פחות על ${catName(c.id)} לעומת אותה נקודה במחזור הקודם.`,
        });
      } else {
        out.push({
          id: `cmp-${c.id}`,
          tone: "neutral",
          text: `ההוצאות על ${catName(c.id)} עלו ב-${c.pct}% לעומת אותה נקודה במחזור הקודם (${formatILS(c.cur)} לעומת ${formatILS(c.prev)}).`,
        });
      }
    }
  }

  // 2) Projection for the end of the cycle at the current pace.
  const budget = budgetForCycle(snap.budgets, current);
  const curTotal = cycleTotals(snap, all, [current])[0];
  if (budget && progress.status === "current" && progress.elapsedDays >= 7 && progress.fraction < 0.9) {
    const projectedVariable = Math.round(curTotal.variable / progress.fraction);
    const expectedRecurring = snap.recurring_occurrences
      .filter((o) => o.cycle_start === current && o.status === "expected")
      .reduce((s, o) => s + o.amount, 0);
    const projected = projectedVariable + curTotal.recurring + expectedRecurring;
    const pct = Math.round((projected / budget) * 100);
    if (pct <= 90) {
      out.push({
        id: "projection",
        tone: "positive",
        text: `בקצב הנוכחי המחזור צפוי להסתיים בכ-${pct}% מהתקציב — נשאר מרווח נעים.`,
      });
    } else if (pct > 100) {
      out.push({
        id: "projection",
        tone: "attention",
        text: `בקצב הנוכחי המחזור צפוי להגיע לכ-${pct}% מהתקציב. כדאי להציץ בקטגוריות הגדולות.`,
      });
    }
  }

  // 3) Biggest category this cycle.
  if (curTotal.consumed > 0 && curTotal.byCategory.size >= 2) {
    const [topId, topAmt] = [...curTotal.byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = Math.round((topAmt / curTotal.consumed) * 100);
    if (share >= 25) {
      out.push({
        id: "top-category",
        tone: "neutral",
        text: `${catName(topId)} היא הקטגוריה הגדולה במחזור הזה — ${share}% מההוצאות.`,
      });
    }
  }

  // 4) Completed cycles: discretionary spending trend.
  const lastDone = cycleTotals(snap, all, [shiftCycleKey(current, -2), prev]);
  if (lastDone[0].consumed > 0 && lastDone[1].consumed > 0) {
    const a = lastDone[0].discretionary;
    const b = lastDone[1].discretionary;
    if (a >= MIN_COMPARE_AGOROT && b > 0) {
      const pct = Math.round(((b - a) / a) * 100);
      if (Math.abs(pct) >= MIN_CHANGE_PCT) {
        out.push({
          id: "discretionary",
          tone: pct < 0 ? "positive" : "neutral",
          text:
            pct < 0
              ? `במחזור ${cycleLabel(prev)} הוצאות הפינוקים והבילויים ירדו ב-${Math.abs(pct)}% לעומת המחזור שלפניו.`
              : `במחזור ${cycleLabel(prev)} הוצאות הפינוקים והבילויים עלו ב-${pct}% לעומת המחזור שלפניו.`,
        });
      }
    }
    const prevBudget = lastDone[1].budget;
    if (prevBudget && lastDone[1].consumed <= prevBudget) {
      out.push({
        id: "prev-within",
        tone: "positive",
        text: `מחזור ${cycleLabel(prev)} הסתיים בתוך התקציב, עם ${formatILS(prevBudget - lastDone[1].consumed)} שנשארו.`,
      });
    }
  }

  // 5) Planned purchases that became real purchases.
  const converted = snap.planned_purchases.filter((p) => p.status === "purchased");
  if (converted.length >= 2) {
    out.push({
      id: "planned",
      tone: "neutral",
      text: `${converted.length} רכישות שתוכננו מראש בוצעו בפועל, בסך ${formatILS(converted.reduce((s, p) => s + p.amount, 0))}.`,
    });
  }

  return out.slice(0, 5);
}
