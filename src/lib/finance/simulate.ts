import { cycleKeyFor } from "../cycle";
import type { ISODate } from "../dates";
import { Agorot, percent } from "../money";
import type { Expense, PaymentMethod, Settings, Snapshot } from "../types";
import { allocations, summarizeCycle } from "./budget";
import { cardForecast } from "./forecast";
import { buildInstallments, cardConfigOf } from "./schedule";

export interface SimItem {
  key: string;
  description: string;
  amount: Agorot;
  category_id: string;
  payment_method: PaymentMethod;
  installments_count: number;
}

export interface SimCategoryEffect {
  categoryId: string;
  before: Agorot;
  after: Agorot;
  budget: Agorot | null;
}

export interface SimStatementEffect {
  chargeDate: ISODate;
  before: Agorot;
  after: Agorot;
}

export interface SimulationResult {
  budget: Agorot | null;
  consumedBefore: Agorot;
  consumedAfter: Agorot;
  remainingBefore: Agorot | null;
  remainingAfter: Agorot | null;
  usageBefore: number | null;
  usageAfter: number | null;
  freeToSpendAfter: Agorot | null;
  addedThisCycle: Agorot;
  addedLaterCycles: Agorot;
  itemsTotal: Agorot;
  categories: SimCategoryEffect[];
  statements: SimStatementEffect[];
}

/**
 * "מה אם אקנה?" — run the real budget & card calculations on a hypothetical copy of the data
 * with the simulated purchases added as if bought today. Nothing is persisted.
 */
export function simulatePurchases(snap: Snapshot, settings: Settings, today: ISODate, items: SimItem[]): SimulationResult {
  const valid = items.filter((i) => i.amount > 0);
  const cfg = cardConfigOf(settings);
  const fakeExpenses: Expense[] = valid.map((i) => ({
    id: `sim-${i.key}`,
    description: i.description || "רכישה",
    amount: i.amount,
    category_id: i.category_id,
    purchase_date: today,
    payment_method: i.payment_method,
    installments_count: i.payment_method === "credit_card" ? Math.max(1, Math.min(i.installments_count, i.amount)) : 1,
    notes: null,
    source: "planned",
    recurring_occurrence_id: null,
    planned_purchase_id: null,
    created_at: "",
    updated_at: "",
  }));
  const hypothetical: Snapshot = {
    ...snap,
    expenses: [...snap.expenses, ...fakeExpenses],
    installments: [...snap.installments, ...fakeExpenses.flatMap((e) => buildInstallments(e, cfg))],
  };
  const key = cycleKeyFor(today);
  const policy = settings.accounting_policy;
  const before = summarizeCycle(snap, policy, key, today);
  const after = summarizeCycle(hypothetical, policy, key, today);

  const fakeAlloc = allocations({ expenses: fakeExpenses, installments: hypothetical.installments }, policy);
  const addedThisCycle = fakeAlloc.filter((a) => a.cycle === key).reduce((s, a) => s + a.amount, 0);
  const itemsTotal = valid.reduce((s, i) => s + i.amount, 0);

  const touched = new Set(valid.map((i) => i.category_id));
  const categories: SimCategoryEffect[] = after.byCategory
    .filter((c) => touched.has(c.categoryId))
    .map((c) => ({
      categoryId: c.categoryId,
      before: before.byCategory.find((b) => b.categoryId === c.categoryId)?.spent ?? 0,
      after: c.spent,
      budget: c.budget,
    }));

  const fBefore = cardForecast(snap, settings, today, 6);
  const fAfter = cardForecast(hypothetical, settings, today, 6);
  const statements: SimStatementEffect[] = fAfter.statements
    .map((s, idx) => ({ chargeDate: s.chargeDate, before: fBefore.statements[idx]?.total ?? 0, after: s.total }))
    .filter((s) => s.after !== s.before);

  return {
    budget: before.budget,
    consumedBefore: before.consumed,
    consumedAfter: after.consumed,
    remainingBefore: before.remaining,
    remainingAfter: after.remaining,
    usageBefore: before.usagePct,
    usageAfter: after.budget === null ? null : percent(after.consumed, after.budget),
    freeToSpendAfter: after.freeToSpend,
    addedThisCycle,
    addedLaterCycles: itemsTotal - addedThisCycle,
    itemsTotal,
    categories,
    statements,
  };
}
