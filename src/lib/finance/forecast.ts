import { installmentChargeDate, nextChargeDate, upcomingChargeDates } from "../card";
import type { ISODate } from "../dates";
import type { Agorot } from "../money";
import type { Expense, Installment, RecurringOccurrence, RecurringRule, Settings, Snapshot } from "../types";
import { installmentsByExpense } from "./budget";
import { cardConfigOf } from "./schedule";

export interface StatementLine {
  expense: Expense;
  installment: Installment;
}

export interface ExpectedRecurringCharge {
  occurrence: RecurringOccurrence;
  rule: RecurringRule | undefined;
  chargeDate: ISODate;
}

export interface Statement {
  chargeDate: ISODate;
  actualTotal: Agorot; // recorded card expenses
  expectedRecurringTotal: Agorot; // unconfirmed recurring card charges
  total: Agorot;
  lines: StatementLine[];
  expectedRecurring: ExpectedRecurringCharge[];
}

export interface InstallmentPlanStatus {
  expense: Expense;
  installments: Installment[];
  paidCount: number;
  paidAmount: Agorot;
  remainingAmount: Agorot;
  nextCharge: Installment | null;
}

export interface CardForecast {
  nextChargeDate: ISODate;
  next: Statement;
  statements: Statement[]; // next N statements, starting with `next`
  futureAfterNext: Agorot; // all recorded card charges after the next statement
  paidTotal: Agorot; // card charges already charged (charge date before today)
  installmentPlans: InstallmentPlanStatus[]; // active multi-payment purchases
}

/**
 * Credit-card forecast. Only credit-card expenses participate; each payment is counted
 * exactly once, on its own charge date. Bank transfers and cash never appear here.
 */
export function cardForecast(snap: Snapshot, settings: Settings, today: ISODate, months = 6): CardForecast {
  const cfg = cardConfigOf(settings);
  const cardExpenses = snap.expenses.filter((e) => e.payment_method === "credit_card");
  const expById = new Map(cardExpenses.map((e) => [e.id, e]));
  const byExp = installmentsByExpense(snap.installments.filter((i) => expById.has(i.expense_id)));
  const dates = upcomingChargeDates(today, cfg, months);
  const nextDate = nextChargeDate(today, cfg);

  const statementsMap = new Map<ISODate, Statement>(
    dates.map((d) => [
      d,
      { chargeDate: d, actualTotal: 0, expectedRecurringTotal: 0, total: 0, lines: [], expectedRecurring: [] },
    ]),
  );

  let futureAfterNext = 0;
  let paidTotal = 0;
  for (const [expId, insts] of byExp) {
    const expense = expById.get(expId)!;
    for (const inst of insts) {
      if (!inst.charge_date) continue;
      if (inst.charge_date < today) paidTotal += inst.amount;
      if (inst.charge_date > nextDate) futureAfterNext += inst.amount;
      const st = statementsMap.get(inst.charge_date);
      if (st) {
        st.lines.push({ expense, installment: inst });
        st.actualTotal += inst.amount;
      }
    }
  }

  const rulesById = new Map(snap.recurring_rules.map((r) => [r.id, r]));
  for (const occ of snap.recurring_occurrences) {
    if (occ.status !== "expected") continue;
    const rule = rulesById.get(occ.rule_id);
    if (!rule || rule.payment_method !== "credit_card") continue;
    const chargeDate = installmentChargeDate(occ.due_date, 0, cfg);
    const st = statementsMap.get(chargeDate);
    if (st) {
      st.expectedRecurring.push({ occurrence: occ, rule, chargeDate });
      st.expectedRecurringTotal += occ.amount;
    }
  }

  const statements = dates.map((d) => {
    const st = statementsMap.get(d)!;
    st.total = st.actualTotal + st.expectedRecurringTotal;
    st.lines.sort((a, b) => (a.expense.purchase_date < b.expense.purchase_date ? 1 : -1));
    return st;
  });

  const installmentPlans: InstallmentPlanStatus[] = [];
  for (const [expId, insts] of byExp) {
    const expense = expById.get(expId)!;
    if (expense.installments_count < 2) continue;
    const paid = insts.filter((i) => i.charge_date && i.charge_date < today);
    const remaining = insts.filter((i) => !i.charge_date || i.charge_date >= today);
    if (remaining.length === 0) continue;
    installmentPlans.push({
      expense,
      installments: insts,
      paidCount: paid.length,
      paidAmount: paid.reduce((s, i) => s + i.amount, 0),
      remainingAmount: remaining.reduce((s, i) => s + i.amount, 0),
      nextCharge: remaining[0] ?? null,
    });
  }
  installmentPlans.sort((a, b) => b.remainingAmount - a.remainingAmount);

  return {
    nextChargeDate: nextDate,
    next: statements[0],
    statements,
    futureAfterNext,
    paidTotal,
    installmentPlans,
  };
}
