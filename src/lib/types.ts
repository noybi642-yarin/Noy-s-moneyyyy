import type { Agorot } from "./money";
import type { ISODate } from "./dates";
import type { CycleKey } from "./cycle";

export type PaymentMethod = "credit_card" | "bank_transfer" | "cash";
export type AccountingPolicy = "cash_flow" | "commitment";
export type ExpenseSource = "manual" | "recurring" | "planned";
export type OccurrenceStatus = "expected" | "confirmed" | "skipped";
export type PlannedStatus = "planned" | "purchased";

export const PAYMENT_METHODS: PaymentMethod[] = ["credit_card", "bank_transfer", "cash"];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  credit_card: "כרטיס אשראי",
  bank_transfer: "העברה בנקאית",
  cash: "מזומן",
};

export const ACCOUNTING_POLICY_LABEL: Record<AccountingPolicy, string> = {
  cash_flow: "תזרים חודשי",
  commitment: "התחייבות ברכישה",
};

export const MAX_INSTALLMENTS = 36;

export interface Settings {
  accounting_policy: AccountingPolicy;
  card_cutoff_day: number;
  card_billing_day: number;
  notify_70: boolean;
  notify_90: boolean;
  notify_100: boolean;
  notify_pace: boolean;
  onboarded: boolean;
  updated_at: string;
}

/** A budget amount effective from a cycle onward (until a later record exists). */
export interface BudgetRecord {
  id: string;
  effective_cycle: CycleKey;
  amount: Agorot;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  monthly_budget: Agorot | null;
  is_discretionary: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: Agorot; // total purchase amount
  category_id: string;
  purchase_date: ISODate;
  payment_method: PaymentMethod;
  installments_count: number; // 1 for non-installment purchases
  notes: string | null;
  source: ExpenseSource;
  recurring_occurrence_id: string | null;
  planned_purchase_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One payment of an expense. Every expense has >= 1 payment row; amounts always sum to
 * the expense amount. `charge_date` is the expected credit-card charge date (null for
 * cash / bank transfer, which are paid on the purchase date).
 */
export interface Installment {
  id: string; // `${expense_id}:${number}`
  expense_id: string;
  number: number; // 1-based
  amount: Agorot;
  charge_date: ISODate | null;
}

export interface RecurringRule {
  id: string;
  description: string;
  amount: Agorot;
  category_id: string;
  payment_method: PaymentMethod;
  day_of_month: number;
  start_date: ISODate;
  end_date: ISODate | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecurringOccurrence {
  id: string; // deterministic: `occ:${rule_id}:${cycle_start}`
  rule_id: string;
  cycle_start: CycleKey;
  due_date: ISODate;
  amount: Agorot;
  status: OccurrenceStatus;
  expense_id: string | null;
  is_overridden: boolean;
}

export interface PlannedPurchase {
  id: string;
  description: string;
  amount: Agorot;
  category_id: string;
  payment_method: PaymentMethod;
  installments_count: number;
  notes: string | null;
  status: PlannedStatus;
  expense_id: string | null;
  purchased_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Snapshot {
  settings: Settings | null;
  budgets: BudgetRecord[];
  categories: Category[];
  expenses: Expense[];
  installments: Installment[];
  recurring_rules: RecurringRule[];
  recurring_occurrences: RecurringOccurrence[];
  planned_purchases: PlannedPurchase[];
}

export type TableName = Exclude<keyof Snapshot, "settings">;

export const TABLES: TableName[] = [
  "budgets",
  "categories",
  "expenses",
  "installments",
  "recurring_rules",
  "recurring_occurrences",
  "planned_purchases",
];

type RowOf<T extends TableName> = Snapshot[T][number];

/** An atomic set of changes. Applied as a single DB transaction. */
export interface ChangeSet {
  settings?: Settings;
  upsert: { [T in TableName]?: RowOf<T>[] };
  delete: { [T in TableName]?: string[] };
}

export function emptySnapshot(): Snapshot {
  return {
    settings: null,
    budgets: [],
    categories: [],
    expenses: [],
    installments: [],
    recurring_rules: [],
    recurring_occurrences: [],
    planned_purchases: [],
  };
}

export function emptyChangeSet(): ChangeSet {
  return { upsert: {}, delete: {} };
}

export function isChangeSetEmpty(cs: ChangeSet): boolean {
  return (
    !cs.settings &&
    TABLES.every((t) => !(cs.upsert[t]?.length) && !(cs.delete[t]?.length))
  );
}

/** Pure: apply a change set to a snapshot (deletes first, then upserts by id). */
export function applyChangeSet(snap: Snapshot, cs: ChangeSet): Snapshot {
  const next: Snapshot = { ...snap };
  if (cs.settings) next.settings = cs.settings;
  for (const t of TABLES) {
    const del = cs.delete[t];
    const ups = cs.upsert[t] as { id: string }[] | undefined;
    if (!del?.length && !ups?.length) continue;
    let rows = snap[t] as { id: string }[];
    if (del?.length) {
      const set = new Set(del);
      rows = rows.filter((r) => !set.has(r.id));
    }
    if (ups?.length) {
      const map = new Map(rows.map((r) => [r.id, r]));
      for (const u of ups) map.set(u.id, u);
      rows = [...map.values()];
    }
    (next as unknown as Record<string, unknown>)[t] = rows;
  }
  // Mirror DB cascades: installments of deleted expenses.
  if (cs.delete.expenses?.length) {
    const gone = new Set(cs.delete.expenses);
    next.installments = next.installments.filter((i) => !gone.has(i.expense_id));
  }
  if (cs.delete.recurring_rules?.length) {
    const gone = new Set(cs.delete.recurring_rules);
    next.recurring_occurrences = next.recurring_occurrences.filter((o) => !gone.has(o.rule_id));
  }
  return next;
}

export function mergeChangeSets(...sets: ChangeSet[]): ChangeSet {
  const out = emptyChangeSet();
  for (const cs of sets) {
    if (cs.settings) out.settings = cs.settings;
    for (const t of TABLES) {
      if (cs.delete[t]?.length) {
        (out.delete[t] ??= []).push(...cs.delete[t]!);
      }
      if (cs.upsert[t]?.length) {
        const arr = ((out.upsert as Record<string, { id: string }[]>)[t] ??= []);
        for (const row of cs.upsert[t] as { id: string }[]) {
          const i = arr.findIndex((r) => r.id === row.id);
          if (i >= 0) arr[i] = row;
          else arr.push(row);
        }
      }
    }
  }
  return out;
}
