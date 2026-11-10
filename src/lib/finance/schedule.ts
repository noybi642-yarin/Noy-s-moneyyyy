import { CardConfig, installmentChargeDate } from "../card";
import { cycleKeyFor, CycleKey, shiftCycleKey } from "../cycle";
import { splitInstallments } from "../money";
import type { Expense, Installment, Settings } from "../types";

export function cardConfigOf(settings: Pick<Settings, "card_cutoff_day" | "card_billing_day">): CardConfig {
  return { cutoffDay: settings.card_cutoff_day, billingDay: settings.card_billing_day };
}

export function installmentId(expenseId: string, n: number): string {
  return `${expenseId}:${n}`;
}

/**
 * Build the payment rows for an expense. Amounts always reconcile exactly to the total
 * (remainder agorot go to the first payment). Only credit-card expenses get charge dates
 * and may have more than one payment.
 */
export function buildInstallments(
  expense: Pick<Expense, "id" | "amount" | "purchase_date" | "payment_method" | "installments_count">,
  cfg: CardConfig,
): Installment[] {
  const isCard = expense.payment_method === "credit_card";
  const count = isCard ? Math.max(1, expense.installments_count) : 1;
  const parts = splitInstallments(expense.amount, count);
  return parts.map((amount, i) => ({
    id: installmentId(expense.id, i + 1),
    expense_id: expense.id,
    number: i + 1,
    amount,
    charge_date: isCard ? installmentChargeDate(expense.purchase_date, i, cfg) : null,
  }));
}

/** Budget cycle that installment number `n` (1-based) is allocated to under cash-flow basis. */
export function installmentBudgetCycle(purchaseDate: string, n: number): CycleKey {
  return shiftCycleKey(cycleKeyFor(purchaseDate), n - 1);
}
