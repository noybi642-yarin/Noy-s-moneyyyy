"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Bookmark, Check, Pencil, Plus, ShoppingBag, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { useData } from "@/components/app/data-provider";
import { PageHeader } from "@/components/app/page-header";
import { Money } from "@/components/app/money";
import { CategoryIcon } from "@/components/app/category-icon";
import { AmountInput } from "@/components/app/amount-input";
import { ExpenseForm, InstallmentStepper, METHOD_OPTIONS } from "@/components/app/expense-form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { ProgressBar } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { simulatePurchases, SimItem } from "@/lib/finance/simulate";
import { convertPlannedToExpense, deletePlanned, newId, savePlanned } from "@/lib/finance/mutations";
import { agorotToInput, formatILS, parseShekelsToAgorot } from "@/lib/money";
import { formatShortDate } from "@/lib/dates";
import { applyChangeSet, mergeChangeSets, PAYMENT_METHOD_LABEL, PaymentMethod, PlannedPurchase } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DraftItem {
  key: string;
  plannedId?: string;
  description: string;
  amount: string;
  category_id: string;
  payment_method: PaymentMethod;
  installments_count: number;
}

function blank(categoryId: string): DraftItem {
  return { key: newId(), description: "", amount: "", category_id: categoryId, payment_method: "credit_card", installments_count: 1 };
}

export default function WhatIfPage() {
  const { snapshot, settings, today, categories, categoryById, run } = useData();
  const defaultCat = categories.find((c) => c.is_discretionary)?.id ?? categories[0]?.id ?? "";
  const [items, setItems] = useState<DraftItem[]>(() => [blank(defaultCat)]);
  const [editingPlanned, setEditingPlanned] = useState<PlannedPurchase | null>(null);
  const [buying, setBuying] = useState<PlannedPurchase | null>(null);
  const [removing, setRemoving] = useState<PlannedPurchase | null>(null);
  const [confirmBuyAll, setConfirmBuyAll] = useState(false);

  const simItems: SimItem[] = items
    .map((i) => ({ ...i, amount: parseShekelsToAgorot(i.amount) ?? 0 }))
    .filter((i) => i.amount > 0 && i.category_id);
  const simKey = JSON.stringify(simItems);
  const result = useMemo(
    () => simulatePurchases(snapshot, settings, today, JSON.parse(simKey) as SimItem[]),
    [snapshot, settings, today, simKey],
  );
  const hasItems = simItems.length > 0;

  const plannedList = snapshot.planned_purchases.filter((p) => p.status === "planned").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const purchasedList = snapshot.planned_purchases.filter((p) => p.status === "purchased").sort((a, b) => ((a.purchased_at ?? "") < (b.purchased_at ?? "") ? 1 : -1));
  const allPlanned = useMemo(
    () =>
      simulatePurchases(
        snapshot,
        settings,
        today,
        plannedList.map((p) => ({ key: p.id, description: p.description, amount: p.amount, category_id: p.category_id, payment_method: p.payment_method, installments_count: p.installments_count })),
      ),
    [snapshot, settings, today, plannedList],
  );

  const update = (key: string, patch: Partial<DraftItem>) => setItems((arr) => arr.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const validDrafts = items.filter((i) => (parseShekelsToAgorot(i.amount) ?? 0) > 0);
  const toInput = (i: DraftItem) => ({
    id: i.plannedId,
    description: i.description.trim() || categoryById.get(i.category_id)?.name || "רכישה",
    amount: parseShekelsToAgorot(i.amount)!,
    category_id: i.category_id,
    payment_method: i.payment_method,
    installments_count: i.payment_method === "credit_card" ? i.installments_count : 1,
  });

  async function saveAsPlanned() {
    const ok = await run(
      (snap) => {
        let cur = snap;
        const sets = validDrafts.map((d) => {
          const r = savePlanned(cur, toInput(d));
          cur = applyChangeSet(cur, r.changes);
          return r.changes;
        });
        return mergeChangeSets(...sets);
      },
      { success: validDrafts.length > 1 ? "נשמרו כרכישות מתוכננות" : "נשמר כרכישה מתוכננת" },
    );
    if (ok) setItems([blank(defaultCat)]);
  }

  async function buyAll() {
    const ok = await run(
      (snap, s) => {
        let cur = snap;
        const sets = validDrafts.map((d) => {
          const input = toInput(d);
          const p = savePlanned(cur, input);
          cur = applyChangeSet(cur, p.changes);
          const c = convertPlannedToExpense(cur, s, p.planned.id, { ...input, purchase_date: today, notes: null });
          cur = applyChangeSet(cur, c.changes);
          return mergeChangeSets(p.changes, c.changes);
        });
        return mergeChangeSets(...sets);
      },
      { success: "נרשם ביומן ההוצאות" },
    );
    if (ok) setItems([blank(defaultCat)]);
    return ok;
  }

  function simulatePlanned(p: PlannedPurchase) {
    setItems((arr) => {
      const filtered = arr.filter((i) => i.amount || i.description);
      if (filtered.some((i) => i.plannedId === p.id)) return arr;
      return [
        ...filtered,
        {
          key: newId(),
          plannedId: p.id,
          description: p.description,
          amount: agorotToInput(p.amount),
          category_id: p.category_id,
          payment_method: p.payment_method,
          installments_count: p.installments_count,
        },
      ];
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const usageAfter = result.usageAfter ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title="מה אם אקנה?" subtitle="לבדוק את ההשפעה לפני שמחליטים. שום דבר לא נשמר עד שבוחרים." back="/" />

      {/* Simulator */}
      <section className="space-y-3">
        {items.map((item, idx) => (
          <Card key={item.key} className="animate-rise p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
                <WandSparkles className="size-4 text-blush-ink" />
                {item.plannedId ? "רכישה מתוכננת" : `פריט ${idx + 1}`}
              </span>
              {items.length > 1 ? (
                <button type="button" onClick={() => setItems((a) => a.filter((x) => x.key !== item.key))} className="rounded-full p-1 text-muted hover:text-ink" aria-label="הסרת פריט">
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
            <div className="space-y-3">
              <AmountInput size="md" value={item.amount} onChange={(v) => update(item.key, { amount: v })} autoFocus={idx === 0 && !item.amount} />
              <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                <Input placeholder="מה? (למשל תכשיטים)" value={item.description} onChange={(e) => update(item.key, { description: e.target.value })} aria-label="תיאור" />
                <NativeSelect value={item.category_id} onChange={(e) => update(item.key, { category_id: e.target.value })} aria-label="קטגוריה">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Segmented size="sm" value={item.payment_method} onChange={(v) => update(item.key, { payment_method: v })} options={METHOD_OPTIONS} />
              {item.payment_method === "credit_card" ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">תשלומים</span>
                  <InstallmentStepper value={item.installments_count} onChange={(n) => update(item.key, { installments_count: n })} />
                </div>
              ) : null}
            </div>
          </Card>
        ))}
        <Button variant="outline" className="w-full" onClick={() => setItems((a) => [...a, blank(defaultCat)])}>
          <Plus /> עוד פריט לסימולציה
        </Button>
      </section>

      {/* Result */}
      <Card className={cn("overflow-hidden transition", !hasItems && "opacity-70")}>
        <div className="bg-blush-soft px-5 py-4">
          <p className="text-[13px] font-medium text-blush-ink">יתרה היפותטית · לא נשמרת</p>
          {result.budget === null ? (
            <p className="mt-1 text-sm text-muted">לא הוגדר תקציב למחזור הנוכחי</p>
          ) : (
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted">נשאר היום</p>
                <Money value={result.remainingBefore!} className="text-xl font-semibold text-muted" />
              </div>
              <ArrowLeft className="mb-1.5 size-5 text-blush-ink" />
              <div className="text-end">
                <p className="text-xs text-muted">אחרי הקנייה</p>
                <Money value={result.remainingAfter!} className={cn("text-[32px] font-semibold leading-none", result.remainingAfter! < 0 ? "text-danger" : "text-ink")} />
              </div>
            </div>
          )}
        </div>
        <CardContent className="space-y-4 pt-4">
          {result.budget !== null ? (
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span>ניצול התקציב</span>
                <span>
                  <span className="num">{Math.round(result.usageBefore ?? 0)}%</span> ← <span className="num font-semibold text-ink">{Math.round(usageAfter)}%</span>
                </span>
              </div>
              <ProgressBar value={usageAfter} marker={result.usageBefore} />
              {result.freeToSpendAfter !== null && result.freeToSpendAfter !== result.remainingAfter ? (
                <p className="mt-2 text-xs text-muted">
                  אחרי הוצאות קבועות שעוד יירדו יישארו <Money value={result.freeToSpendAfter} className={cn("font-semibold", result.freeToSpendAfter < 0 ? "text-danger" : "text-ink")} />
                </p>
              ) : null}
            </div>
          ) : null}

          {hasItems ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-cream-deep p-3">
                  <p className="text-xs text-muted">נזקף למחזור הנוכחי</p>
                  <Money value={result.addedThisCycle} className="font-semibold" />
                </div>
                <div className="rounded-2xl bg-cream-deep p-3">
                  <p className="text-xs text-muted">יידחה למחזורים הבאים</p>
                  <Money value={result.addedLaterCycles} className="font-semibold" />
                </div>
              </div>

              {result.categories.length > 0 ? (
                <div>
                  <p className="mb-2 text-[13px] font-medium text-muted">השפעה על הקטגוריה</p>
                  <ul className="space-y-2">
                    {result.categories.map((c) => {
                      const cat = categoryById.get(c.categoryId);
                      return (
                        <li key={c.categoryId} className="flex items-center gap-2.5 text-sm">
                          <CategoryIcon icon={cat?.icon} color={cat?.color} size="sm" />
                          <span className="min-w-0 flex-1 truncate">{cat?.name}</span>
                          <span className="text-xs text-muted">
                            <Money value={c.before} /> ← <Money value={c.after} className="font-semibold text-ink" />
                            {c.budget !== null ? (
                              <span className={cn("ms-1", c.after > c.budget ? "text-danger" : "")}>
                                / <Money value={c.budget} />
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {result.statements.length > 0 ? (
                <div>
                  <p className="mb-2 text-[13px] font-medium text-muted">השפעה על חיובי האשראי</p>
                  <ul className="divide-y divide-line/60 rounded-2xl bg-cream-deep/60 px-3">
                    {result.statements.map((s) => (
                      <li key={s.chargeDate} className="flex justify-between py-2 text-sm">
                        <span>חיוב {formatShortDate(s.chargeDate)}</span>
                        <span className="text-xs text-muted">
                          <Money value={s.before} /> ← <Money value={s.after} className="font-semibold text-ink" />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="blush" onClick={saveAsPlanned}>
                  <Bookmark /> שמירה כמתוכנן
                </Button>
                <Button onClick={() => setConfirmBuyAll(true)}>
                  <ShoppingBag /> קניתי!
                </Button>
              </div>
              <button type="button" className="w-full text-center text-sm text-muted hover:text-ink" onClick={() => setItems([blank(defaultCat)])}>
                ניקוי הסימולציה
              </button>
            </>
          ) : (
            <p className="text-center text-sm text-muted">מקלידים סכום והתוצאה מופיעה מיד</p>
          )}
        </CardContent>
      </Card>

      {/* Planned list */}
      <Card id="planned" className="scroll-mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-blush-ink" /> רכישות מתוכננות
          </CardTitle>
          {plannedList.length ? <Money value={plannedList.reduce((s, p) => s + p.amount, 0)} className="text-sm font-semibold" /> : null}
        </CardHeader>
        <CardContent>
          {plannedList.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">אין רכישות מתוכננות. אפשר לשמור סימולציה כרשימת משאלות.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted">
                לא נספרות בתקציב ולא בחיובי האשראי. אם כולן ייקנו היום, היתרה תהיה{" "}
                {allPlanned.remainingAfter !== null ? <Money value={allPlanned.remainingAfter} className={cn("font-semibold", allPlanned.remainingAfter < 0 ? "text-danger" : "text-ink")} /> : "—"}.
              </p>
              <ul className="space-y-2">
                {plannedList.map((p) => {
                  const cat = categoryById.get(p.category_id);
                  return (
                    <li key={p.id} className="rounded-2xl bg-cream-deep/60 p-3">
                      <div className="flex items-center gap-3">
                        <CategoryIcon icon={cat?.icon} color={cat?.color} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium">{p.description}</p>
                          <p className="text-xs text-muted">
                            {PAYMENT_METHOD_LABEL[p.payment_method]}
                            {p.installments_count > 1 ? ` · ${p.installments_count} תשלומים` : ""}
                          </p>
                        </div>
                        <Money value={p.amount} className="font-semibold" />
                      </div>
                      <div className="mt-2.5 flex gap-1.5">
                        <Button size="sm" className="flex-1" onClick={() => setBuying(p)}>
                          <Check /> קניתי
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => simulatePlanned(p)} aria-label="הוספה לסימולציה">
                          <WandSparkles />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingPlanned(p)} aria-label="עריכה">
                          <Pencil />
                        </Button>
                        <Button size="sm" variant="danger-ghost" onClick={() => setRemoving(p)} aria-label="הסרה">
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {purchasedList.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>תוכננו ונקנו</CardTitle>
            <Badge variant="sage">{purchasedList.length}</Badge>
          </CardHeader>
          <CardContent className="pt-1">
            <ul className="divide-y divide-line/60">
              {purchasedList.slice(0, 10).map((p) => {
                const exp = snapshot.expenses.find((e) => e.id === p.expense_id);
                return (
                  <li key={p.id} className="flex justify-between py-2.5 text-sm">
                    <span>
                      {p.description}
                      {exp ? <span className="text-xs text-muted"> · {formatShortDate(exp.purchase_date)}</span> : null}
                    </span>
                    <Money value={exp?.amount ?? p.amount} className="font-medium" />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={buying !== null} onOpenChange={(o) => !o && setBuying(null)}>
        <DialogContent title="סימון כנרכש" description="הפרטים נשמרים מהתכנון — אפשר לעדכן סכום או תאריך. ההוצאה תיספר פעם אחת בלבד.">
          {buying ? <ExpenseForm planned={buying} onDone={() => setBuying(null)} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editingPlanned !== null} onOpenChange={(o) => !o && setEditingPlanned(null)}>
        <DialogContent title="עריכת רכישה מתוכננת">
          {editingPlanned ? <PlannedEditForm planned={editingPlanned} onDone={() => setEditingPlanned(null)} /> : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="להסיר מהרשימה?"
        description={removing ? `${removing.description} · ${formatILS(removing.amount)}` : undefined}
        confirmLabel="הסרה"
        danger
        onConfirm={() => run((snap) => deletePlanned(snap, removing!.id), { success: "הוסר מהרשימה" })}
      />

      <ConfirmDialog
        open={confirmBuyAll}
        onOpenChange={setConfirmBuyAll}
        title="לרשום כהוצאה בפועל?"
        description={`${validDrafts.length > 1 ? `${validDrafts.length} פריטים` : "הפריט"} יירשמו ביומן עם תאריך של היום, בסך ${formatILS(result.itemsTotal)}.`}
        confirmLabel="רישום"
        onConfirm={buyAll}
      />
    </div>
  );
}

function PlannedEditForm({ planned, onDone }: { planned: PlannedPurchase; onDone: () => void }) {
  const { categories, run } = useData();
  const [amount, setAmount] = useState(agorotToInput(planned.amount));
  const [description, setDescription] = useState(planned.description);
  const [categoryId, setCategoryId] = useState(planned.category_id);
  const [method, setMethod] = useState<PaymentMethod>(planned.payment_method);
  const [count, setCount] = useState(planned.installments_count);
  const a = parseShekelsToAgorot(amount);
  return (
    <div className="space-y-3">
      <AmountInput size="md" value={amount} onChange={setAmount} />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} aria-label="תיאור" />
      <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="קטגוריה">
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <Segmented size="sm" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
      {method === "credit_card" ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">תשלומים</span>
          <InstallmentStepper value={count} onChange={setCount} />
        </div>
      ) : null}
      <Button
        className="w-full"
        disabled={!a}
        onClick={async () => {
          const ok = await run(
            (snap) =>
              savePlanned(snap, { id: planned.id, description, amount: a!, category_id: categoryId, payment_method: method, installments_count: count, notes: planned.notes }).changes,
            { success: "עודכן" },
          );
          if (ok) onDone();
        }}
      >
        שמירה
      </Button>
    </div>
  );
}
