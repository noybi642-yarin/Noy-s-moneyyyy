import { describe, expect, it } from "vitest";
import { applyChangeSet, baseSnapshot, SETTINGS } from "./helpers";
import {
  saveExpense,
  deleteExpense,
  setBudget,
  confirmOccurrence,
  saveRecurringRule,
  savePlanned,
  convertPlannedToExpense,
  deletePlanned,
  deleteCategory,
  editOccurrence,
  updateSettings,
  DomainError,
  deleteRecurringRule,
  setOccurrenceSkipped,
} from "@/lib/finance/mutations";
import { summarizeCycle, budgetForCycle, remainingInstallmentCommitments, plannedTotal, alertLevel } from "@/lib/finance/budget";
import { cardForecast } from "@/lib/finance/forecast";
import { generateOccurrences, dueDateInCycle } from "@/lib/finance/recurring";
import { simulatePurchases } from "@/lib/finance/simulate";
import { generateInsights } from "@/lib/finance/insights";
import type { Snapshot } from "@/lib/types";

const TODAY = "2026-11-10";

function add(snap: Snapshot, input: Parameters<typeof saveExpense>[2]) {
  const r = saveExpense(snap, snap.settings!, input);
  return { snap: applyChangeSet(snap, r.changes), expense: r.expense };
}

const base = (o: Partial<Parameters<typeof saveExpense>[2]> = {}) => ({
  description: "קניה",
  amount: 10000,
  category_id: "food",
  purchase_date: TODAY,
  payment_method: "credit_card" as const,
  installments_count: 1,
  ...o,
});

describe("budget remaining calculations", () => {
  it("consumes budget, remaining and usage", () => {
    let s = baseSnapshot();
    s = add(s, base({ amount: 25050 })).snap;
    s = add(s, base({ amount: 4950, payment_method: "cash" })).snap;
    s = add(s, base({ amount: 99999, purchase_date: "2026-11-01" })).snap; // previous cycle
    const sum = summarizeCycle(s, "cash_flow", "2026-11-02", TODAY);
    expect(sum.budget).toBe(1_000_000);
    expect(sum.consumed).toBe(30000);
    expect(sum.remaining).toBe(970000);
    expect(sum.usagePct).toBeCloseTo(3);
    expect(sum.byCategory.find((c) => c.categoryId === "food")!.spent).toBe(30000);
  });

  it("keeps historical budgets when the budget changes", () => {
    let s = baseSnapshot();
    s = applyChangeSet(s, setBudget(s, "2026-11-02", 800_000));
    expect(budgetForCycle(s.budgets, "2026-10-02")).toBe(1_000_000);
    expect(budgetForCycle(s.budgets, "2026-11-02")).toBe(800_000);
    expect(budgetForCycle(s.budgets, "2027-03-02")).toBe(800_000);
    expect(budgetForCycle(s.budgets, "2025-12-02")).toBeNull();
    // Editing the same cycle again updates, not duplicates.
    s = applyChangeSet(s, setBudget(s, "2026-11-02", 850_000));
    expect(s.budgets.filter((b) => b.effective_cycle === "2026-11-02")).toHaveLength(1);
    expect(budgetForCycle(s.budgets, "2026-11-02")).toBe(850_000);
  });

  it("supports both accounting policies without changing data", () => {
    let s = baseSnapshot();
    s = add(s, base({ amount: 120000, installments_count: 12 })).snap;
    const cash = summarizeCycle(s, "cash_flow", "2026-11-02", TODAY);
    const commit = summarizeCycle(s, "commitment", "2026-11-02", TODAY);
    expect(cash.consumed).toBe(10000);
    expect(commit.consumed).toBe(120000);
    expect(summarizeCycle(s, "cash_flow", "2027-10-02", TODAY).consumed).toBe(10000); // 12th payment
    expect(summarizeCycle(s, "cash_flow", "2027-11-02", TODAY).consumed).toBe(0);
    expect(summarizeCycle(s, "commitment", "2026-12-02", TODAY).consumed).toBe(0);
    expect(s.expenses).toHaveLength(1);
    expect(s.installments).toHaveLength(12);
  });

  it("alert levels", () => {
    expect(alertLevel(69.9)).toBe(0);
    expect(alertLevel(70)).toBe(70);
    expect(alertLevel(90)).toBe(90);
    expect(alertLevel(100)).toBe(100);
    expect(alertLevel(null)).toBe(0);
  });

  it("flags a spending pace well ahead of the cycle", () => {
    let s = baseSnapshot();
    s = add(s, base({ amount: 700_000, payment_method: "cash" })).snap;
    const sum = summarizeCycle(s, "cash_flow", "2026-11-02", TODAY);
    expect(sum.paceAhead).toBe(true);
    const calm = summarizeCycle(add(baseSnapshot(), base({ amount: 50_000 })).snap, "cash_flow", "2026-11-02", TODAY);
    expect(calm.paceAhead).toBe(false);
  });
});

describe("installments", () => {
  it("records schedule, totals reconcile, and card dates", () => {
    const { snap, expense } = add(baseSnapshot(), base({ amount: 100000, installments_count: 3, purchase_date: "2026-11-15" }));
    const inst = snap.installments.filter((i) => i.expense_id === expense.id).sort((a, b) => a.number - b.number);
    expect(inst.map((i) => i.amount)).toEqual([33334, 33333, 33333]);
    expect(inst.reduce((a, i) => a + i.amount, 0)).toBe(100000);
    expect(inst.map((i) => i.charge_date)).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(remainingInstallmentCommitments(snap, TODAY)).toBe(100000);
    expect(remainingInstallmentCommitments(snap, "2027-01-15")).toBe(33333);
  });

  it("rejects installments for non-card payments and forces 1 payment", () => {
    const { snap } = add(baseSnapshot(), base({ payment_method: "bank_transfer", installments_count: 5 }));
    expect(snap.expenses[0].installments_count).toBe(1);
    expect(snap.installments).toHaveLength(1);
    expect(snap.installments[0].charge_date).toBeNull();
  });
});

describe("editing and deleting transactions", () => {
  it("editing replaces payment rows without duplicates", () => {
    const first = add(baseSnapshot(), base({ amount: 60000, installments_count: 6 }));
    const expense = first.expense;
    let snap = first.snap;
    expect(snap.installments).toHaveLength(6);
    snap = add(snap, { ...base({ amount: 30000, installments_count: 2 }), id: expense.id }).snap;
    expect(snap.expenses).toHaveLength(1);
    expect(snap.installments).toHaveLength(2);
    expect(snap.installments.reduce((a, i) => a + i.amount, 0)).toBe(30000);
    snap = add(snap, { ...base({ amount: 30000, payment_method: "cash" }), id: expense.id }).snap;
    expect(snap.installments).toHaveLength(1);
    expect(snap.installments[0].charge_date).toBeNull();
    expect(summarizeCycle(snap, "cash_flow", "2026-11-02", TODAY).consumed).toBe(30000);
    expect(cardForecast(snap, SETTINGS, TODAY).next.total).toBe(0);
  });

  it("deleting updates balances", () => {
    const first = add(baseSnapshot(), base({ amount: 50000, installments_count: 5 }));
    const expense = first.expense;
    let snap = first.snap;
    expect(summarizeCycle(snap, "cash_flow", "2026-11-02", TODAY).consumed).toBe(10000);
    snap = applyChangeSet(snap, deleteExpense(snap, expense.id));
    expect(snap.expenses).toHaveLength(0);
    expect(snap.installments).toHaveLength(0);
    expect(summarizeCycle(snap, "cash_flow", "2026-11-02", TODAY).consumed).toBe(0);
  });

  it("validates input", () => {
    const s = baseSnapshot();
    expect(() => saveExpense(s, SETTINGS, base({ amount: 0 }))).toThrow(DomainError);
    expect(() => saveExpense(s, SETTINGS, base({ category_id: "nope" }))).toThrow(DomainError);
    expect(() => saveExpense(s, SETTINGS, base({ purchase_date: "2026-02-30" }))).toThrow(DomainError);
    expect(() => saveExpense(s, SETTINGS, base({ installments_count: 40 }))).toThrow(DomainError);
  });
});

describe("credit-card forecast", () => {
  it("separates next statement, future commitments and paid amounts; excludes cash & transfers", () => {
    let s = baseSnapshot();
    s = add(s, base({ amount: 30000, purchase_date: "2026-11-01" })).snap; // charged 2026-11-10 (today)
    s = add(s, base({ amount: 120000, installments_count: 12, purchase_date: "2026-10-05" })).snap; // first 2026-11-10
    s = add(s, base({ amount: 20000, purchase_date: "2026-11-05" })).snap; // 2026-12-10
    s = add(s, base({ amount: 99900, payment_method: "bank_transfer" })).snap;
    s = add(s, base({ amount: 5000, payment_method: "cash" })).snap;
    const f = cardForecast(s, SETTINGS, TODAY);
    expect(f.nextChargeDate).toBe("2026-11-10");
    expect(f.next.actualTotal).toBe(30000 + 10000);
    expect(f.statements[1].chargeDate).toBe("2026-12-10");
    expect(f.statements[1].actualTotal).toBe(20000 + 10000);
    expect(f.futureAfterNext).toBe(20000 + 110000);
    expect(f.paidTotal).toBe(0);
    expect(f.installmentPlans).toHaveLength(1);
    expect(f.installmentPlans[0].remainingAmount).toBe(120000);

    const later = cardForecast(s, SETTINGS, "2026-11-11");
    expect(later.paidTotal).toBe(40000);
    expect(later.installmentPlans[0].paidCount).toBe(1);
    expect(later.installmentPlans[0].paidAmount + later.installmentPlans[0].remainingAmount).toBe(120000);

    // Every card payment appears in exactly one statement → no double counting.
    const all = cardForecast(s, SETTINGS, "2026-10-01", 24);
    const total = all.statements.reduce((a, st) => a + st.actualTotal, 0);
    expect(total).toBe(30000 + 120000 + 20000);
  });

  it("recalculates unpaid charge dates when card settings change", () => {
    let s = baseSnapshot();
    s = add(s, base({ amount: 30000, installments_count: 3, purchase_date: "2026-10-20" })).snap;
    const before = s.installments.map((i) => i.charge_date).sort();
    expect(before).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    const cs = updateSettings(s, { card_billing_day: 15 }, "2026-11-12");
    s = applyChangeSet(s, cs);
    const after = s.installments.map((i) => i.charge_date).sort();
    expect(after).toEqual(["2026-11-10", "2026-12-15", "2027-01-15"]);
  });
});

describe("recurring payment generation", () => {
  const rule = {
    description: "גן",
    amount: 250000,
    category_id: "other",
    payment_method: "bank_transfer" as const,
    day_of_month: 5,
    start_date: "2026-09-01",
    end_date: null,
    active: true,
  };

  it("generates one occurrence per cycle and never duplicates", () => {
    let s = baseSnapshot();
    s = applyChangeSet(s, saveRecurringRule(s, rule, TODAY).changes);
    const n1 = s.recurring_occurrences.length;
    expect(n1).toBe(5); // Sep..Jan (current Nov + 2 ahead)
    s = applyChangeSet(s, generateOccurrences(s, TODAY));
    s = applyChangeSet(s, generateOccurrences(s, TODAY));
    expect(s.recurring_occurrences.length).toBe(n1);
    const keys = s.recurring_occurrences.map((o) => o.cycle_start);
    expect(new Set(keys).size).toBe(keys.length);
    // advancing time adds new cycles only
    s = applyChangeSet(s, generateOccurrences(s, "2026-12-15"));
    expect(s.recurring_occurrences.length).toBe(n1 + 1);
  });

  it("places due dates inside the cycle", () => {
    expect(dueDateInCycle(5, "2026-11-02")).toBe("2026-11-05");
    expect(dueDateInCycle(1, "2026-11-02")).toBe("2026-12-01");
    expect(dueDateInCycle(31, "2026-11-02")).toBe("2026-11-30");
    expect(dueDateInCycle(31, "2027-02-02")).toBe("2027-02-28");
    expect(dueDateInCycle(30, "2028-02-02")).toBe("2028-02-29");
  });

  it("expected vs confirmed, no double counting", () => {
    let s = baseSnapshot();
    s = applyChangeSet(s, saveRecurringRule(s, rule, TODAY).changes);
    let sum = summarizeCycle(s, "cash_flow", "2026-11-02", TODAY);
    expect(sum.consumed).toBe(0);
    expect(sum.expectedRecurringTotal).toBe(250000);
    expect(sum.freeToSpend).toBe(1_000_000 - 250000);
    const occ = s.recurring_occurrences.find((o) => o.cycle_start === "2026-11-02")!;
    s = applyChangeSet(s, confirmOccurrence(s, SETTINGS, occ.id).changes);
    sum = summarizeCycle(s, "cash_flow", "2026-11-02", TODAY);
    expect(sum.consumed).toBe(250000);
    expect(sum.expectedRecurringTotal).toBe(0);
    expect(sum.freeToSpend).toBe(750000);
    expect(() => confirmOccurrence(s, SETTINGS, occ.id)).toThrow(DomainError);
    // deleting the expense returns the occurrence to expected
    const exp = s.expenses.find((e) => e.recurring_occurrence_id === occ.id)!;
    s = applyChangeSet(s, deleteExpense(s, exp.id));
    expect(s.recurring_occurrences.find((o) => o.id === occ.id)!.status).toBe("expected");
    expect(summarizeCycle(s, "cash_flow", "2026-11-02", TODAY).consumed).toBe(0);
  });

  it("editing the rule updates future expected occurrences only; single edits are kept", () => {
    let s = baseSnapshot();
    const r = saveRecurringRule(s, rule, TODAY);
    s = applyChangeSet(s, r.changes);
    const oct = s.recurring_occurrences.find((o) => o.cycle_start === "2026-10-02")!;
    const dec = s.recurring_occurrences.find((o) => o.cycle_start === "2026-12-02")!;
    s = applyChangeSet(s, editOccurrence(s, dec.id, { amount: 300000, due_date: "2026-12-07" }));
    s = applyChangeSet(s, saveRecurringRule(s, { ...rule, id: r.rule.id, amount: 260000 }, TODAY).changes);
    expect(s.recurring_occurrences.find((o) => o.id === oct.id)!.amount).toBe(250000); // past untouched
    expect(s.recurring_occurrences.find((o) => o.cycle_start === "2026-11-02")!.amount).toBe(260000);
    expect(s.recurring_occurrences.find((o) => o.id === dec.id)!.amount).toBe(300000); // overridden kept
    expect(s.recurring_occurrences.find((o) => o.cycle_start === "2027-01-02")!.amount).toBe(260000);
    // ending the rule removes future expected occurrences
    s = applyChangeSet(s, saveRecurringRule(s, { ...rule, id: r.rule.id, amount: 260000, end_date: "2026-11-30" }, TODAY).changes);
    expect(s.recurring_occurrences.some((o) => o.cycle_start === "2027-01-02")).toBe(false);
    // skip
    const nov = s.recurring_occurrences.find((o) => o.cycle_start === "2026-11-02")!;
    s = applyChangeSet(s, setOccurrenceSkipped(s, nov.id, true));
    expect(summarizeCycle(s, "cash_flow", "2026-11-02", TODAY).expectedRecurringTotal).toBe(0);
    // delete rule keeps confirmed expenses
    s = applyChangeSet(s, confirmOccurrence(s, SETTINGS, oct.id).changes);
    s = applyChangeSet(s, deleteRecurringRule(s, r.rule.id));
    expect(s.recurring_occurrences).toHaveLength(0);
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0].recurring_occurrence_id).toBeNull();
  });

  it("expected recurring card charges appear in the card forecast until confirmed", () => {
    let s = baseSnapshot();
    s = applyChangeSet(s, saveRecurringRule(s, { ...rule, payment_method: "credit_card", amount: 4990, day_of_month: 15 }, TODAY).changes);
    let f = cardForecast(s, SETTINGS, TODAY);
    const dec = f.statements.find((st) => st.chargeDate === "2026-12-10")!;
    expect(dec.expectedRecurringTotal).toBe(4990);
    const occ = s.recurring_occurrences.find((o) => o.cycle_start === "2026-11-02")!;
    s = applyChangeSet(s, confirmOccurrence(s, SETTINGS, occ.id).changes);
    f = cardForecast(s, SETTINGS, TODAY);
    const dec2 = f.statements.find((st) => st.chargeDate === "2026-12-10")!;
    expect(dec2.expectedRecurringTotal).toBe(0);
    expect(dec2.actualTotal).toBe(4990);
    expect(dec2.total).toBe(4990);
  });
});

describe("planned purchases", () => {
  it("planned do not affect budget or card; conversion counts once", () => {
    let s = baseSnapshot();
    const p = savePlanned(s, { description: "תכשיט", amount: 45000, category_id: "fun", payment_method: "credit_card", installments_count: 3 });
    s = applyChangeSet(s, p.changes);
    expect(plannedTotal(s.planned_purchases)).toBe(45000);
    expect(summarizeCycle(s, "cash_flow", "2026-11-02", TODAY).consumed).toBe(0);
    expect(cardForecast(s, SETTINGS, TODAY).statements.every((st) => st.total === 0)).toBe(true);

    const conv = convertPlannedToExpense(s, SETTINGS, p.planned.id, {
      description: "תכשיט",
      amount: 45000,
      category_id: "fun",
      purchase_date: TODAY,
      payment_method: "credit_card",
      installments_count: 3,
    });
    s = applyChangeSet(s, conv.changes);
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0].source).toBe("planned");
    expect(s.expenses[0].planned_purchase_id).toBe(p.planned.id);
    expect(plannedTotal(s.planned_purchases)).toBe(0);
    expect(s.planned_purchases[0].status).toBe("purchased");
    expect(summarizeCycle(s, "commitment", "2026-11-02", TODAY).consumed).toBe(45000);
    expect(() => convertPlannedToExpense(s, SETTINGS, p.planned.id, { ...conv.expense, notes: null })).toThrow(DomainError);

    // deleting the real expense returns it to planned
    s = applyChangeSet(s, deleteExpense(s, conv.expense.id));
    expect(s.planned_purchases[0].status).toBe("planned");
    expect(s.expenses).toHaveLength(0);

    s = applyChangeSet(s, deletePlanned(s, p.planned.id));
    expect(s.planned_purchases).toHaveLength(0);
  });
});

describe("categories", () => {
  it("requires reassignment before deleting a used category", () => {
    let s = add(baseSnapshot(), base({ category_id: "fun" })).snap;
    expect(() => deleteCategory(s, "fun", null)).toThrow(DomainError);
    s = applyChangeSet(s, deleteCategory(s, "fun", "other"));
    expect(s.categories.some((c) => c.id === "fun")).toBe(false);
    expect(s.expenses[0].category_id).toBe("other");
    s = applyChangeSet(s, deleteCategory(s, "food", null)); // unused
    expect(s.categories).toHaveLength(1);
  });
});

describe("what-if simulation", () => {
  it("shows effects without persisting", () => {
    let s = baseSnapshot();
    s = add(s, base({ amount: 600000, payment_method: "cash" })).snap;
    const before = JSON.stringify(s);
    const r = simulatePurchases(s, SETTINGS, TODAY, [
      { key: "a", description: "תכשיטים", amount: 45000, category_id: "fun", payment_method: "credit_card", installments_count: 3 },
      { key: "b", description: "נעליים", amount: 30000, category_id: "fun", payment_method: "cash", installments_count: 1 },
    ]);
    expect(JSON.stringify(s)).toBe(before);
    expect(r.remainingBefore).toBe(400000);
    expect(r.addedThisCycle).toBe(15000 + 30000);
    expect(r.remainingAfter).toBe(400000 - 45000);
    expect(r.addedLaterCycles).toBe(30000);
    expect(r.categories[0]).toMatchObject({ categoryId: "fun", before: 0, after: 45000 });
    expect(r.statements.map((x) => x.after - x.before)).toEqual([15000, 15000, 15000]);
    const c = simulatePurchases(s, { ...SETTINGS, accounting_policy: "commitment" }, TODAY, [
      { key: "a", description: "", amount: 45000, category_id: "fun", payment_method: "credit_card", installments_count: 3 },
    ]);
    expect(c.addedThisCycle).toBe(45000);
  });
});

describe("insights", () => {
  it("returns nothing without enough data", () => {
    expect(generateInsights(baseSnapshot(), SETTINGS, TODAY)).toEqual([]);
  });

  it("compares same point of previous cycle", () => {
    let s = baseSnapshot();
    s = add(s, base({ amount: 50000, category_id: "fun", purchase_date: "2026-10-04", payment_method: "cash" })).snap;
    s = add(s, base({ amount: 10000, category_id: "food", purchase_date: "2026-10-05", payment_method: "cash" })).snap;
    s = add(s, base({ amount: 20000, category_id: "fun", purchase_date: "2026-11-04", payment_method: "cash" })).snap;
    s = add(s, base({ amount: 99999, category_id: "fun", purchase_date: "2026-10-25", payment_method: "cash" })).snap; // later in cycle: ignored
    const ins = generateInsights(s, SETTINGS, TODAY);
    expect(ins.some((i) => i.text.includes("60% פחות על fun"))).toBe(true);
  });
});
