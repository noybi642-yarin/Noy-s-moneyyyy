"use client";

import { useState } from "react";
import { Pencil, Trash2, Repeat, Sparkles, CreditCard, Landmark, Banknote, CircleCheck, Clock } from "lucide-react";
import { useData } from "./data-provider";
import { CategoryIcon } from "./category-icon";
import { Money } from "./money";
import { ExpenseForm } from "./expense-form";
import { ConfirmDialog } from "./confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Expense, PAYMENT_METHOD_LABEL, PaymentMethod } from "@/lib/types";
import { formatDayMonth, formatShortDate } from "@/lib/dates";
import { deleteExpense } from "@/lib/finance/mutations";
import { cycleLabel } from "@/lib/cycle";
import { installmentBudgetCycle } from "@/lib/finance/schedule";
import { cn } from "@/lib/utils";

export const METHOD_ICON: Record<PaymentMethod, typeof CreditCard> = {
  credit_card: CreditCard,
  bank_transfer: Landmark,
  cash: Banknote,
};

export function SourceBadge({ source }: { source: Expense["source"] }) {
  if (source === "recurring")
    return (
      <Badge variant="sage">
        <Repeat className="size-3" />
        קבועה
      </Badge>
    );
  if (source === "planned")
    return (
      <Badge variant="blush">
        <Sparkles className="size-3" />
        מתוכננת
      </Badge>
    );
  return null;
}

export function ExpenseRow({
  expense,
  amountOverride,
  subtitle,
  onClick,
}: {
  expense: Expense;
  amountOverride?: { amount: number; label: string };
  subtitle?: React.ReactNode;
  onClick?: () => void;
}) {
  const { categoryById } = useData();
  const cat = categoryById.get(expense.category_id);
  const MethodIcon = METHOD_ICON[expense.payment_method];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-start transition hover:bg-cream-deep/70 active:scale-[0.99]"
    >
      <CategoryIcon icon={cat?.icon} color={cat?.color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-medium text-ink">{expense.description}</span>
          <SourceBadge source={expense.source} />
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <MethodIcon className="size-3.5" />
          <span className="truncate">{subtitle ?? cat?.name ?? "ללא קטגוריה"}</span>
          {expense.installments_count > 1 ? <span className="num shrink-0">· {expense.installments_count} תשלומים</span> : null}
        </div>
      </div>
      <div className="text-end">
        <Money value={amountOverride?.amount ?? expense.amount} className="text-[15px] font-semibold text-ink" />
        {amountOverride ? <div className="text-[11px] text-muted">{amountOverride.label}</div> : null}
      </div>
    </button>
  );
}

export function ExpenseDetailsDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { snapshot, categoryById, run, today } = useData();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Always show the latest version of the record.
  const current = expense ? snapshot.expenses.find((e) => e.id === expense.id) ?? null : null;

  const close = (o: boolean) => {
    if (!o) setEditing(false);
    onOpenChange(o);
  };

  if (!current) return null;
  const cat = categoryById.get(current.category_id);
  const inst = snapshot.installments.filter((i) => i.expense_id === current.id).sort((a, b) => a.number - b.number);
  const paid = inst.filter((i) => i.charge_date && i.charge_date < today);
  const remaining = inst.reduce((s, i) => s + i.amount, 0) - paid.reduce((s, i) => s + i.amount, 0);
  const planned = current.planned_purchase_id ? snapshot.planned_purchases.find((p) => p.id === current.planned_purchase_id) : null;

  return (
    <>
      <Dialog open={open && !confirmDelete} onOpenChange={close}>
        <DialogContent title={editing ? "עריכת הוצאה" : current.description} description={editing ? undefined : cat?.name}>
          {editing ? (
            <ExpenseForm expense={current} onDone={() => setEditing(false)} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-3xl bg-card p-4 ring-1 ring-line/60">
                <CategoryIcon icon={cat?.icon} color={cat?.color} size="lg" />
                <div className="flex-1">
                  <Money value={current.amount} className="text-3xl font-semibold" />
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{PAYMENT_METHOD_LABEL[current.payment_method]}</span>
                    <span>·</span>
                    <span>נרכש ב-{formatDayMonth(current.purchase_date)}</span>
                    <SourceBadge source={current.source} />
                  </div>
                </div>
              </div>

              {current.payment_method === "credit_card" ? (
                <div className="rounded-3xl bg-card p-4 ring-1 ring-line/60">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">{inst.length > 1 ? "לוח תשלומים" : "חיוב באשראי"}</p>
                    {inst.length > 1 ? (
                      <p className="text-xs text-muted">
                        שולמו <Money value={current.amount - remaining} /> · נותרו <Money value={remaining} className="font-medium text-ink" />
                      </p>
                    ) : null}
                  </div>
                  <ul className="max-h-64 divide-y divide-line/60 overflow-y-auto">
                    {inst.map((i) => {
                      const isPaid = i.charge_date !== null && i.charge_date < today;
                      return (
                        <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                          <span className="flex items-center gap-2">
                            {isPaid ? <CircleCheck className="size-4 text-sage-ink" /> : <Clock className="size-4 text-muted" />}
                            <span className="num text-muted">
                              {i.number}/{inst.length}
                            </span>
                            <span>{i.charge_date ? `חיוב ${formatShortDate(i.charge_date)}` : ""}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="hidden text-[11px] text-muted sm:inline">תקציב {cycleLabel(installmentBudgetCycle(current.purchase_date, i.number))}</span>
                            <Money value={i.amount} className={cn("font-medium", isPaid && "text-muted")} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {current.notes ? <p className="rounded-2xl bg-cream-deep p-3 text-sm text-ink">{current.notes}</p> : null}
              {planned ? <p className="text-xs text-muted">הרכישה הזו תוכננה מראש ב״מה אם אקנה?״.</p> : null}
              {current.source === "recurring" ? <p className="text-xs text-muted">נוצרה מתוך הוצאה קבועה. מחיקה תחזיר את התשלום לסטטוס ״צפוי״.</p> : null}

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>
                  <Pencil /> עריכה
                </Button>
                <Button variant="danger-ghost" className="flex-1" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> מחיקה
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="למחוק את ההוצאה?"
        description={
          planned
            ? "ההוצאה תימחק והרכישה תחזור לרשימת הרכישות המתוכננות."
            : inst.length > 1
              ? "ההוצאה וכל התשלומים שלה יימחקו, והיתרות יתעדכנו."
              : "ההוצאה תימחק והיתרות יתעדכנו."
        }
        confirmLabel="מחיקה"
        danger
        onConfirm={async () => {
          const ok = await run((snap) => deleteExpense(snap, current.id), { success: "ההוצאה נמחקה" });
          if (ok) onOpenChange(false);
          return ok;
        }}
      />
    </>
  );
}
