/**
 * All write operations are pure functions: (snapshot, input) -> ChangeSet.
 * A ChangeSet is applied atomically by the store (a single DB transaction in Supabase),
 * so business rules live here once and are unit-tested independently of storage.
 */
import { cycleKeyFor, CycleKey } from "../cycle";
import { isValidISODate, ISODate } from "../dates";
import { assertAgorot, Agorot } from "../money";
import {
  BudgetRecord,
  Category,
  ChangeSet,
  emptyChangeSet,
  Expense,
  Installment,
  MAX_INSTALLMENTS,
  PaymentMethod,
  PlannedPurchase,
  RecurringOccurrence,
  RecurringRule,
  Settings,
  Snapshot,
} from "../types";
import { resyncRuleOccurrences } from "./recurring";
import { buildInstallments, cardConfigOf } from "./schedule";

export class DomainError extends Error {}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback (very old browsers): RFC4122-ish random id.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------- expenses

export interface ExpenseInput {
  id?: string;
  description: string;
  amount: Agorot;
  category_id: string;
  purchase_date: ISODate;
  payment_method: PaymentMethod;
  installments_count: number;
  notes?: string | null;
}

function validateExpenseLike(input: Omit<ExpenseInput, "id">, snap: Snapshot, opts: { requireDate: boolean }) {
  assertAgorot(input.amount);
  if (input.amount <= 0) throw new DomainError("הסכום חייב להיות גדול מאפס");
  if (!input.description.trim()) throw new DomainError("חסר תיאור");
  if (!snap.categories.some((c) => c.id === input.category_id)) throw new DomainError("קטגוריה לא קיימת");
  if (opts.requireDate && !isValidISODate(input.purchase_date)) throw new DomainError("תאריך לא תקין");
  const n = input.installments_count;
  if (!Number.isInteger(n) || n < 1 || n > MAX_INSTALLMENTS) throw new DomainError("מספר תשלומים לא תקין");
  if (n > 1 && input.payment_method !== "credit_card") throw new DomainError("תשלומים אפשריים רק בכרטיס אשראי");
  if (n > input.amount) throw new DomainError("סכום קטן מדי למספר התשלומים");
}

/** Build an expense row + its payment rows, replacing any previous payment rows. */
function expenseChanges(
  snap: Snapshot,
  settings: Settings,
  expense: Expense,
): { expense: Expense; installments: Installment[]; deleteInstallments: string[] } {
  const installments = buildInstallments(expense, cardConfigOf(settings));
  const keep = new Set(installments.map((i) => i.id));
  const deleteInstallments = snap.installments
    .filter((i) => i.expense_id === expense.id && !keep.has(i.id))
    .map((i) => i.id);
  return { expense, installments, deleteInstallments };
}

export function saveExpense(
  snap: Snapshot,
  settings: Settings,
  input: ExpenseInput,
  extra: Partial<Pick<Expense, "source" | "recurring_occurrence_id" | "planned_purchase_id">> = {},
): { changes: ChangeSet; expense: Expense } {
  const normalized = {
    ...input,
    description: input.description.trim(),
    notes: input.notes?.trim() ? input.notes.trim() : null,
    installments_count: input.payment_method === "credit_card" ? input.installments_count : 1,
  };
  validateExpenseLike(normalized, snap, { requireDate: true });
  const existing = input.id ? snap.expenses.find((e) => e.id === input.id) : undefined;
  if (input.id && !existing) throw new DomainError("ההוצאה לא נמצאה");
  const ts = nowIso();
  const expense: Expense = {
    id: existing?.id ?? newId(),
    description: normalized.description,
    amount: normalized.amount,
    category_id: normalized.category_id,
    purchase_date: normalized.purchase_date,
    payment_method: normalized.payment_method,
    installments_count: normalized.installments_count,
    notes: normalized.notes,
    source: extra.source ?? existing?.source ?? "manual",
    recurring_occurrence_id: extra.recurring_occurrence_id ?? existing?.recurring_occurrence_id ?? null,
    planned_purchase_id: extra.planned_purchase_id ?? existing?.planned_purchase_id ?? null,
    created_at: existing?.created_at ?? ts,
    updated_at: ts,
  };
  const { installments, deleteInstallments } = expenseChanges(snap, settings, expense);
  const cs = emptyChangeSet();
  cs.upsert.expenses = [expense];
  cs.upsert.installments = installments;
  if (deleteInstallments.length) cs.delete.installments = deleteInstallments;

  // Keep a linked recurring occurrence in sync with the edited actual amount/date.
  if (existing?.recurring_occurrence_id) {
    const occ = snap.recurring_occurrences.find((o) => o.id === existing.recurring_occurrence_id);
    if (occ && (occ.amount !== expense.amount || occ.due_date !== expense.purchase_date)) {
      cs.upsert.recurring_occurrences = [
        { ...occ, amount: expense.amount, due_date: expense.purchase_date, is_overridden: true },
      ];
    }
  }
  return { changes: cs, expense };
}

/**
 * Delete an expense and its payments. If it came from a recurring occurrence, the
 * occurrence goes back to "expected"; if it came from a planned purchase, the planned
 * purchase goes back to "planned" — so nothing is lost and nothing is counted twice.
 */
export function deleteExpense(snap: Snapshot, expenseId: string): ChangeSet {
  const expense = snap.expenses.find((e) => e.id === expenseId);
  if (!expense) throw new DomainError("ההוצאה לא נמצאה");
  const cs = emptyChangeSet();
  cs.delete.expenses = [expenseId];
  cs.delete.installments = snap.installments.filter((i) => i.expense_id === expenseId).map((i) => i.id);
  const occ = snap.recurring_occurrences.find(
    (o) => o.expense_id === expenseId || o.id === expense.recurring_occurrence_id,
  );
  if (occ) cs.upsert.recurring_occurrences = [{ ...occ, status: "expected", expense_id: null }];
  const planned = snap.planned_purchases.find(
    (p) => p.expense_id === expenseId || p.id === expense.planned_purchase_id,
  );
  if (planned) {
    cs.upsert.planned_purchases = [
      { ...planned, status: "planned", expense_id: null, purchased_at: null, updated_at: nowIso() },
    ];
  }
  return cs;
}

// ---------------------------------------------------------------- budgets

/** Set the budget from `cycle` onward. Earlier cycles keep their historical amount. */
export function setBudget(snap: Snapshot, cycle: CycleKey, amount: Agorot): ChangeSet {
  assertAgorot(amount);
  if (amount < 0) throw new DomainError("תקציב לא יכול להיות שלילי");
  const existing = snap.budgets.find((b) => b.effective_cycle === cycle);
  const record: BudgetRecord = {
    id: existing?.id ?? `budget:${cycle}`,
    effective_cycle: cycle,
    amount,
    created_at: existing?.created_at ?? nowIso(),
  };
  const cs = emptyChangeSet();
  cs.upsert.budgets = [record];
  return cs;
}

// ---------------------------------------------------------------- settings

/**
 * Update settings. When the card billing configuration changes, the expected charge date of
 * every *not yet charged* card payment is recalculated; already-charged payments keep their
 * historical date.
 */
export function updateSettings(snap: Snapshot, patch: Partial<Settings>, today: ISODate): ChangeSet {
  if (!snap.settings) throw new DomainError("אין הגדרות");
  const next: Settings = { ...snap.settings, ...patch, updated_at: nowIso() };
  const cs = emptyChangeSet();
  cs.settings = next;
  const cardChanged =
    next.card_billing_day !== snap.settings.card_billing_day || next.card_cutoff_day !== snap.settings.card_cutoff_day;
  if (cardChanged) {
    const cfg = cardConfigOf(next);
    const updates: Installment[] = [];
    const byId = new Map(snap.expenses.map((e) => [e.id, e]));
    for (const inst of snap.installments) {
      if (!inst.charge_date || inst.charge_date < today) continue;
      const e = byId.get(inst.expense_id);
      if (!e) continue;
      const fresh = buildInstallments(e, cfg).find((i) => i.number === inst.number);
      if (fresh && fresh.charge_date !== inst.charge_date && fresh.charge_date! >= today) {
        updates.push({ ...inst, charge_date: fresh.charge_date });
      }
    }
    if (updates.length) cs.upsert.installments = updates;
  }
  return cs;
}

// ---------------------------------------------------------------- categories

export interface CategoryInput {
  id?: string;
  name: string;
  icon: string;
  color: string;
  monthly_budget: Agorot | null;
  is_discretionary: boolean;
}

export function saveCategory(snap: Snapshot, input: CategoryInput): ChangeSet {
  const name = input.name.trim();
  if (!name) throw new DomainError("חסר שם קטגוריה");
  if (snap.categories.some((c) => c.name === name && c.id !== input.id)) throw new DomainError("כבר קיימת קטגוריה בשם הזה");
  if (input.monthly_budget !== null) {
    assertAgorot(input.monthly_budget);
    if (input.monthly_budget < 0) throw new DomainError("תקציב לא יכול להיות שלילי");
  }
  const existing = input.id ? snap.categories.find((c) => c.id === input.id) : undefined;
  const cat: Category = {
    id: existing?.id ?? newId(),
    name,
    icon: input.icon,
    color: input.color,
    monthly_budget: input.monthly_budget,
    is_discretionary: input.is_discretionary,
    sort_order: existing?.sort_order ?? Math.max(-1, ...snap.categories.map((c) => c.sort_order)) + 1,
    created_at: existing?.created_at ?? nowIso(),
  };
  const cs = emptyChangeSet();
  cs.upsert.categories = [cat];
  return cs;
}

export function reorderCategories(snap: Snapshot, orderedIds: string[]): ChangeSet {
  const cs = emptyChangeSet();
  cs.upsert.categories = orderedIds
    .map((id, idx) => {
      const c = snap.categories.find((x) => x.id === id);
      return c && c.sort_order !== idx ? { ...c, sort_order: idx } : null;
    })
    .filter((c): c is Category => c !== null);
  return cs;
}

export function categoryUsageCount(snap: Snapshot, categoryId: string): number {
  return (
    snap.expenses.filter((e) => e.category_id === categoryId).length +
    snap.recurring_rules.filter((r) => r.category_id === categoryId).length +
    snap.planned_purchases.filter((p) => p.category_id === categoryId).length
  );
}

/**
 * Delete a category. If anything references it, a different target category must be given
 * and all expenses, recurring rules and planned purchases are moved to it in the same
 * transaction.
 */
export function deleteCategory(snap: Snapshot, categoryId: string, reassignTo: string | null): ChangeSet {
  if (!snap.categories.some((c) => c.id === categoryId)) throw new DomainError("קטגוריה לא נמצאה");
  const used = categoryUsageCount(snap, categoryId) > 0;
  if (used) {
    if (!reassignTo || reassignTo === categoryId) throw new DomainError("יש לבחור קטגוריה להעברת הרשומות");
    if (!snap.categories.some((c) => c.id === reassignTo)) throw new DomainError("קטגוריית היעד לא קיימת");
  }
  if (snap.categories.length <= 1) throw new DomainError("חייבת להישאר לפחות קטגוריה אחת");
  const cs = emptyChangeSet();
  if (used && reassignTo) {
    const ts = nowIso();
    const exp = snap.expenses.filter((e) => e.category_id === categoryId).map((e) => ({ ...e, category_id: reassignTo, updated_at: ts }));
    const rules = snap.recurring_rules
      .filter((r) => r.category_id === categoryId)
      .map((r) => ({ ...r, category_id: reassignTo, updated_at: ts }));
    const planned = snap.planned_purchases
      .filter((p) => p.category_id === categoryId)
      .map((p) => ({ ...p, category_id: reassignTo, updated_at: ts }));
    if (exp.length) cs.upsert.expenses = exp;
    if (rules.length) cs.upsert.recurring_rules = rules;
    if (planned.length) cs.upsert.planned_purchases = planned;
  }
  cs.delete.categories = [categoryId];
  return cs;
}

// ---------------------------------------------------------------- recurring

export interface RecurringRuleInput {
  id?: string;
  description: string;
  amount: Agorot;
  category_id: string;
  payment_method: PaymentMethod;
  day_of_month: number;
  start_date: ISODate;
  end_date: ISODate | null;
  active: boolean;
}

export function saveRecurringRule(snap: Snapshot, input: RecurringRuleInput, today: ISODate): { changes: ChangeSet; rule: RecurringRule } {
  assertAgorot(input.amount);
  if (input.amount <= 0) throw new DomainError("הסכום חייב להיות גדול מאפס");
  if (!input.description.trim()) throw new DomainError("חסר תיאור");
  if (!snap.categories.some((c) => c.id === input.category_id)) throw new DomainError("קטגוריה לא קיימת");
  if (!Number.isInteger(input.day_of_month) || input.day_of_month < 1 || input.day_of_month > 31) {
    throw new DomainError("יום החיוב חייב להיות בין 1 ל-31");
  }
  if (!isValidISODate(input.start_date)) throw new DomainError("תאריך התחלה לא תקין");
  if (input.end_date && (!isValidISODate(input.end_date) || input.end_date < input.start_date)) {
    throw new DomainError("תאריך הסיום חייב להיות אחרי תאריך ההתחלה");
  }
  const existing = input.id ? snap.recurring_rules.find((r) => r.id === input.id) : undefined;
  const ts = nowIso();
  const rule: RecurringRule = {
    id: existing?.id ?? newId(),
    description: input.description.trim(),
    amount: input.amount,
    category_id: input.category_id,
    payment_method: input.payment_method,
    day_of_month: input.day_of_month,
    start_date: input.start_date,
    end_date: input.end_date,
    active: input.active,
    created_at: existing?.created_at ?? ts,
    updated_at: ts,
  };
  const cs = resyncRuleOccurrences(snap, rule, today);
  cs.upsert.recurring_rules = [rule];
  return { changes: cs, rule };
}

/**
 * Delete a rule. Unconfirmed occurrences disappear with it; confirmed payments stay as
 * regular expenses (their link to the occurrence is cleared by the database).
 */
export function deleteRecurringRule(snap: Snapshot, ruleId: string): ChangeSet {
  if (!snap.recurring_rules.some((r) => r.id === ruleId)) throw new DomainError("ההוראה לא נמצאה");
  const cs = emptyChangeSet();
  cs.delete.recurring_rules = [ruleId];
  const occs = snap.recurring_occurrences.filter((o) => o.rule_id === ruleId);
  cs.delete.recurring_occurrences = occs.map((o) => o.id);
  const linked = snap.expenses.filter((e) => e.recurring_occurrence_id && occs.some((o) => o.id === e.recurring_occurrence_id));
  if (linked.length) {
    cs.upsert.expenses = linked.map((e) => ({ ...e, recurring_occurrence_id: null }));
  }
  return cs;
}

/** Edit a single occurrence (amount / due date) without touching the rule. */
export function editOccurrence(
  snap: Snapshot,
  occurrenceId: string,
  patch: { amount: Agorot; due_date: ISODate },
): ChangeSet {
  const occ = snap.recurring_occurrences.find((o) => o.id === occurrenceId);
  if (!occ) throw new DomainError("התשלום לא נמצא");
  if (occ.status === "confirmed") throw new DomainError("תשלום שאושר נערך דרך יומן ההוצאות");
  assertAgorot(patch.amount);
  if (patch.amount <= 0) throw new DomainError("הסכום חייב להיות גדול מאפס");
  if (!isValidISODate(patch.due_date)) throw new DomainError("תאריך לא תקין");
  const cs = emptyChangeSet();
  cs.upsert.recurring_occurrences = [{ ...occ, amount: patch.amount, due_date: patch.due_date, is_overridden: true }];
  return cs;
}

export function setOccurrenceSkipped(snap: Snapshot, occurrenceId: string, skipped: boolean): ChangeSet {
  const occ = snap.recurring_occurrences.find((o) => o.id === occurrenceId);
  if (!occ) throw new DomainError("התשלום לא נמצא");
  if (occ.status === "confirmed") throw new DomainError("לא ניתן לדלג על תשלום שכבר אושר");
  const cs = emptyChangeSet();
  cs.upsert.recurring_occurrences = [{ ...occ, status: skipped ? "skipped" : "expected" }];
  return cs;
}

/**
 * Confirm that a recurring payment actually happened: creates exactly one expense linked to
 * the occurrence. Confirming twice is rejected, so the payment is never double-counted.
 */
export function confirmOccurrence(
  snap: Snapshot,
  settings: Settings,
  occurrenceId: string,
  overrides: Partial<Pick<ExpenseInput, "amount" | "purchase_date">> = {},
): { changes: ChangeSet; expense: Expense } {
  const occ = snap.recurring_occurrences.find((o) => o.id === occurrenceId);
  if (!occ) throw new DomainError("התשלום לא נמצא");
  if (occ.status === "confirmed" || occ.expense_id || snap.expenses.some((e) => e.recurring_occurrence_id === occ.id)) {
    throw new DomainError("התשלום כבר אושר");
  }
  const rule = snap.recurring_rules.find((r) => r.id === occ.rule_id);
  if (!rule) throw new DomainError("ההוראה הקבועה לא נמצאה");
  const categoryId = snap.categories.some((c) => c.id === rule.category_id) ? rule.category_id : snap.categories[0]?.id;
  const { changes, expense } = saveExpense(
    snap,
    settings,
    {
      description: rule.description,
      amount: overrides.amount ?? occ.amount,
      category_id: categoryId,
      purchase_date: overrides.purchase_date ?? occ.due_date,
      payment_method: rule.payment_method,
      installments_count: 1,
      notes: null,
    },
    { source: "recurring", recurring_occurrence_id: occ.id },
  );
  changes.upsert.recurring_occurrences = [
    {
      ...occ,
      status: "confirmed",
      expense_id: expense.id,
      amount: expense.amount,
      due_date: expense.purchase_date,
      is_overridden: occ.is_overridden || expense.amount !== occ.amount || expense.purchase_date !== occ.due_date,
    } satisfies RecurringOccurrence,
  ];
  return { changes, expense };
}

// ---------------------------------------------------------------- planned purchases

export interface PlannedInput {
  id?: string;
  description: string;
  amount: Agorot;
  category_id: string;
  payment_method: PaymentMethod;
  installments_count: number;
  notes?: string | null;
}

export function savePlanned(snap: Snapshot, input: PlannedInput): { changes: ChangeSet; planned: PlannedPurchase } {
  const normalized = {
    ...input,
    installments_count: input.payment_method === "credit_card" ? input.installments_count : 1,
    purchase_date: "2000-01-01",
  };
  validateExpenseLike(normalized, snap, { requireDate: false });
  const existing = input.id ? snap.planned_purchases.find((p) => p.id === input.id) : undefined;
  if (existing?.status === "purchased") throw new DomainError("הרכישה כבר בוצעה — אפשר לערוך אותה ביומן");
  const ts = nowIso();
  const planned: PlannedPurchase = {
    id: existing?.id ?? newId(),
    description: input.description.trim(),
    amount: input.amount,
    category_id: input.category_id,
    payment_method: input.payment_method,
    installments_count: normalized.installments_count,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    status: "planned",
    expense_id: null,
    purchased_at: null,
    created_at: existing?.created_at ?? ts,
    updated_at: ts,
  };
  const cs = emptyChangeSet();
  cs.upsert.planned_purchases = [planned];
  return { changes: cs, planned };
}

export function deletePlanned(snap: Snapshot, plannedId: string): ChangeSet {
  const p = snap.planned_purchases.find((x) => x.id === plannedId);
  if (!p) throw new DomainError("הרכישה המתוכננת לא נמצאה");
  const cs = emptyChangeSet();
  cs.delete.planned_purchases = [plannedId];
  // A purchased item keeps its real expense; only the link is cleared.
  const linked = snap.expenses.filter((e) => e.planned_purchase_id === plannedId);
  if (linked.length) cs.upsert.expenses = linked.map((e) => ({ ...e, planned_purchase_id: null }));
  return cs;
}

/**
 * Convert a planned purchase into a real expense. The planned purchase is marked as
 * purchased and linked to the new expense; it then no longer counts as "planned", and the
 * expense counts once as an actual transaction.
 */
export function convertPlannedToExpense(
  snap: Snapshot,
  settings: Settings,
  plannedId: string,
  details: Omit<ExpenseInput, "id">,
): { changes: ChangeSet; expense: Expense } {
  const p = snap.planned_purchases.find((x) => x.id === plannedId);
  if (!p) throw new DomainError("הרכישה המתוכננת לא נמצאה");
  if (p.status === "purchased" || p.expense_id || snap.expenses.some((e) => e.planned_purchase_id === p.id)) {
    throw new DomainError("הרכישה כבר סומנה כבוצעה");
  }
  const { changes, expense } = saveExpense(snap, settings, details, { source: "planned", planned_purchase_id: p.id });
  const ts = nowIso();
  changes.upsert.planned_purchases = [
    { ...p, status: "purchased", expense_id: expense.id, purchased_at: ts, updated_at: ts },
  ];
  return { changes, expense };
}

// ---------------------------------------------------------------- onboarding

export const DEFAULT_CATEGORIES: Array<Pick<Category, "name" | "icon" | "color" | "is_discretionary">> = [
  { name: "קניות לבית וסופר", icon: "shopping-cart", color: "#7C9A7E", is_discretionary: false },
  { name: "פארם וטיפוח אישי", icon: "sparkles", color: "#D9A5B3", is_discretionary: false },
  { name: "ניב — טיטולים, בגדים וציוד", icon: "baby", color: "#9DB8C9", is_discretionary: false },
  { name: "אוכל בחוץ ומשלוחים", icon: "utensils", color: "#E0B07A", is_discretionary: true },
  { name: "בגדים, תכשיטים ופינוקים", icon: "gem", color: "#C98DA5", is_discretionary: true },
  { name: "אירועים, מתנות ושמחות", icon: "gift", color: "#B49FCC", is_discretionary: true },
  { name: "בית, ריהוט ותיקונים", icon: "sofa", color: "#A8916F", is_discretionary: false },
  { name: "הוצאות קבועות והעברות", icon: "repeat", color: "#5E7F6B", is_discretionary: false },
  { name: "אחר", icon: "circle-ellipsis", color: "#A3A39B", is_discretionary: false },
];

export function onboard(
  snap: Snapshot,
  input: { budget: Agorot; cutoffDay: number; billingDay: number; today: ISODate },
): ChangeSet {
  const ts = nowIso();
  const cs = emptyChangeSet();
  cs.settings = {
    accounting_policy: "cash_flow",
    card_cutoff_day: input.cutoffDay,
    card_billing_day: input.billingDay,
    notify_70: true,
    notify_90: true,
    notify_100: true,
    notify_pace: true,
    onboarded: true,
    updated_at: ts,
  };
  if (snap.categories.length === 0) {
    cs.upsert.categories = DEFAULT_CATEGORIES.map((c, i) => ({
      ...c,
      id: newId(),
      sort_order: i,
      monthly_budget: null,
      created_at: ts,
    }));
  }
  const budgetCs = setBudget(snap, cycleKeyFor(input.today), input.budget);
  cs.upsert.budgets = budgetCs.upsert.budgets;
  return cs;
}
