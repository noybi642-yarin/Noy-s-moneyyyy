import { cycleKeyFor, CycleKey, cycleProgress, getCycle } from "../cycle";
import type { ISODate } from "../dates";
import { Agorot, percent } from "../money";
import type {
  AccountingPolicy,
  Expense,
  Installment,
  PlannedPurchase,
  RecurringOccurrence,
  Snapshot,
} from "../types";
import { installmentBudgetCycle } from "./schedule";

/** Budget in effect for a cycle: the latest record whose effective cycle <= key. */
export function budgetForCycle(budgets: Snapshot["budgets"], key: CycleKey): Agorot | null {
  let best: { effective_cycle: string; amount: number } | null = null;
  for (const b of budgets) {
    if (b.effective_cycle <= key && (!best || b.effective_cycle > best.effective_cycle)) best = b;
  }
  return best ? best.amount : null;
}

export interface Allocation {
  expense: Expense;
  cycle: CycleKey;
  amount: Agorot;
  installmentNumber: number | null; // null = whole purchase (commitment basis)
}

export function installmentsByExpense(installments: Installment[]): Map<string, Installment[]> {
  const map = new Map<string, Installment[]>();
  for (const i of installments) {
    const arr = map.get(i.expense_id);
    if (arr) arr.push(i);
    else map.set(i.expense_id, [i]);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.number - b.number);
  return map;
}

/**
 * How each expense consumes budget, according to the accounting policy.
 *  - cash_flow:  payment n of a purchase is allocated to the (n-1)th cycle after the purchase cycle.
 *  - commitment: the full purchase amount is allocated to the purchase cycle.
 * The underlying records are never changed by the policy — only this view.
 */
export function allocations(snap: Pick<Snapshot, "expenses" | "installments">, policy: AccountingPolicy): Allocation[] {
  const out: Allocation[] = [];
  if (policy === "commitment") {
    for (const e of snap.expenses) {
      out.push({ expense: e, cycle: cycleKeyFor(e.purchase_date), amount: e.amount, installmentNumber: null });
    }
    return out;
  }
  const byExp = installmentsByExpense(snap.installments);
  for (const e of snap.expenses) {
    const inst = byExp.get(e.id);
    if (!inst || inst.length === 0) {
      // Defensive: an expense without payment rows still counts once, in its purchase cycle.
      out.push({ expense: e, cycle: cycleKeyFor(e.purchase_date), amount: e.amount, installmentNumber: 1 });
      continue;
    }
    for (const i of inst) {
      out.push({
        expense: e,
        cycle: installmentBudgetCycle(e.purchase_date, i.number),
        amount: i.amount,
        installmentNumber: i.number,
      });
    }
  }
  return out;
}

export function allocationsForCycle(all: Allocation[], key: CycleKey): Allocation[] {
  return all.filter((a) => a.cycle === key);
}

export interface CategoryUsage {
  categoryId: string;
  spent: Agorot;
  budget: Agorot | null;
}

export interface CycleSummary {
  key: CycleKey;
  budget: Agorot | null;
  consumed: Agorot;
  remaining: Agorot | null;
  usagePct: number | null;
  /** Unconfirmed (expected) recurring obligations due in this cycle. */
  expectedRecurring: RecurringOccurrence[];
  expectedRecurringTotal: Agorot;
  /** Remaining budget after setting aside expected recurring obligations. */
  freeToSpend: Agorot | null;
  byCategory: CategoryUsage[];
  allocations: Allocation[];
  progress: ReturnType<typeof cycleProgress>;
  /** Expected consumption so far at an even pace. */
  expectedPaceConsumed: Agorot | null;
  paceAhead: boolean;
}

export function summarizeCycle(
  snap: Snapshot,
  policy: AccountingPolicy,
  key: CycleKey,
  today: ISODate,
  precomputed?: Allocation[],
): CycleSummary {
  const all = precomputed ?? allocations(snap, policy);
  const inCycle = allocationsForCycle(all, key);
  const consumed = inCycle.reduce((s, a) => s + a.amount, 0);
  const budget = budgetForCycle(snap.budgets, key);
  const cycle = getCycle(key);
  const progress = cycleProgress(cycle, today);

  const expectedRecurring = snap.recurring_occurrences
    .filter((o) => o.cycle_start === key && o.status === "expected")
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const expectedRecurringTotal = expectedRecurring.reduce((s, o) => s + o.amount, 0);

  const catMap = new Map<string, Agorot>();
  for (const a of inCycle) catMap.set(a.expense.category_id, (catMap.get(a.expense.category_id) ?? 0) + a.amount);
  const byCategory: CategoryUsage[] = snap.categories.map((c) => ({
    categoryId: c.id,
    spent: catMap.get(c.id) ?? 0,
    budget: c.monthly_budget,
  }));
  // Expenses whose category no longer exists (should not happen) are still counted.
  for (const [id, spent] of catMap) {
    if (!snap.categories.some((c) => c.id === id)) byCategory.push({ categoryId: id, spent, budget: null });
  }

  const remaining = budget === null ? null : budget - consumed;
  const freeToSpend = remaining === null ? null : remaining - expectedRecurringTotal;

  let expectedPaceConsumed: Agorot | null = null;
  let paceAhead = false;
  if (budget !== null && progress.status === "current") {
    // Recurring obligations are fixed, so they are excluded from the pace comparison.
    const recurringConsumed = inCycle
      .filter((a) => a.expense.source === "recurring")
      .reduce((s, a) => s + a.amount, 0);
    const variableBudget = Math.max(0, budget - recurringConsumed - expectedRecurringTotal);
    expectedPaceConsumed = Math.round(variableBudget * progress.fraction);
    const variableConsumed = consumed - recurringConsumed;
    // "Significantly ahead": 15% above even pace, and at least ₪200 above it, and past day 3.
    paceAhead =
      progress.elapsedDays >= 3 &&
      progress.fraction < 0.95 &&
      variableConsumed > expectedPaceConsumed * 1.15 &&
      variableConsumed - expectedPaceConsumed >= 20000;
  }

  return {
    key,
    budget,
    consumed,
    remaining,
    usagePct: budget === null ? null : percent(consumed, budget),
    expectedRecurring,
    expectedRecurringTotal,
    freeToSpend,
    byCategory,
    allocations: inCycle,
    progress,
    expectedPaceConsumed,
    paceAhead,
  };
}

/** Unpaid installment amounts of multi-payment card purchases (charge date after today). */
export function remainingInstallmentCommitments(snap: Snapshot, today: ISODate): Agorot {
  const multi = new Set(snap.expenses.filter((e) => e.installments_count > 1).map((e) => e.id));
  let total = 0;
  for (const i of snap.installments) {
    if (multi.has(i.expense_id) && i.charge_date && i.charge_date > today) total += i.amount;
  }
  return total;
}

export function plannedTotal(planned: PlannedPurchase[]): Agorot {
  return planned.filter((p) => p.status === "planned").reduce((s, p) => s + p.amount, 0);
}

export type BudgetAlertLevel = 0 | 70 | 90 | 100;

export function alertLevel(usagePct: number | null): BudgetAlertLevel {
  if (usagePct === null) return 0;
  if (usagePct >= 100) return 100;
  if (usagePct >= 90) return 90;
  if (usagePct >= 70) return 70;
  return 0;
}
