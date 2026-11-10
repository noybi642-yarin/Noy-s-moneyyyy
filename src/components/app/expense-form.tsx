"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, CreditCard, Landmark, Banknote, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useData } from "./data-provider";
import { AmountInput } from "./amount-input";
import { CategoryIcon } from "./category-icon";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { agorotToInput, formatILS, parseShekelsToAgorot, splitInstallments } from "@/lib/money";
import { addDays, formatShortDate, ISODate, isValidISODate } from "@/lib/dates";
import { installmentChargeDate } from "@/lib/card";
import { cardConfigOf } from "@/lib/finance/schedule";
import { convertPlannedToExpense, ExpenseInput, saveExpense } from "@/lib/finance/mutations";
import { alertLevel, summarizeCycle } from "@/lib/finance/budget";
import { cycleKeyFor } from "@/lib/cycle";
import { applyChangeSet, ChangeSet, Expense, MAX_INSTALLMENTS, PaymentMethod, PlannedPurchase } from "@/lib/types";
import { cn } from "@/lib/utils";

const LAST_METHOD_KEY = "noys:last-payment-method";

export const METHOD_OPTIONS: { value: PaymentMethod; label: React.ReactNode }[] = [
  { value: "credit_card", label: (<><CreditCard />אשראי</>) },
  { value: "bank_transfer", label: (<><Landmark />העברה</>) },
  { value: "cash", label: (<><Banknote />מזומן</>) },
];

function readLastMethod(): PaymentMethod {
  try {
    const v = window.localStorage.getItem(LAST_METHOD_KEY);
    if (v === "credit_card" || v === "bank_transfer" || v === "cash") return v;
  } catch {}
  return "credit_card";
}

export function InstallmentStepper({ value, onChange, max = MAX_INSTALLMENTS }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" aria-label="פחות תשלומים" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1}>
        <Minus />
      </Button>
      <div className="min-w-16 text-center">
        <div className="num text-xl font-semibold">{value}</div>
        <div className="text-[11px] text-muted">{value === 1 ? "תשלום אחד" : "תשלומים"}</div>
      </div>
      <Button type="button" variant="outline" size="icon" aria-label="יותר תשלומים" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
        <Plus />
      </Button>
    </div>
  );
}

export function ExpenseForm({
  expense,
  planned,
  onDone,
}: {
  expense?: Expense; // edit mode
  planned?: PlannedPurchase; // convert mode
  onDone?: (saved: Expense) => void;
}) {
  const { categories, snapshot, settings, today, run } = useData();
  const seed = expense ?? planned;
  const [amount, setAmount] = useState(seed ? agorotToInput(seed.amount) : "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [categoryId, setCategoryId] = useState<string>(seed?.category_id ?? "");
  const [date, setDate] = useState<ISODate>(expense?.purchase_date ?? today);
  const [method, setMethod] = useState<PaymentMethod>(() => seed?.payment_method ?? (typeof window === "undefined" ? "credit_card" : readLastMethod()));
  const [installments, setInstallments] = useState(seed?.installments_count ?? 1);
  const [notes, setNotes] = useState(seed?.notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(seed?.notes));
  const [busy, setBusy] = useState(false);
  const [touchedCategory, setTouchedCategory] = useState(Boolean(seed));
  const descRef = useRef<HTMLInputElement>(null);

  const agorot = parseShekelsToAgorot(amount);
  const count = method === "credit_card" ? installments : 1;

  // Merchant memory: recent descriptions -> their category, for one-tap re-entry.
  const recentMerchants = useMemo(() => {
    const map = new Map<string, { category_id: string; method: PaymentMethod; date: string }>();
    for (const e of [...snapshot.expenses].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
      const key = e.description.trim();
      if (key && !map.has(key)) map.set(key, { category_id: e.category_id, method: e.payment_method, date: e.created_at });
    }
    return map;
  }, [snapshot.expenses]);

  const suggestions = useMemo(() => {
    const q = description.trim();
    const all = [...recentMerchants.keys()];
    if (!q) return all.slice(0, 6);
    return all.filter((m) => m !== q && m.includes(q)).slice(0, 6);
  }, [description, recentMerchants]);

  function pickMerchant(name: string) {
    setDescription(name);
    const m = recentMerchants.get(name);
    if (m && !touchedCategory && categories.some((c) => c.id === m.category_id)) setCategoryId(m.category_id);
  }

  function onDescriptionChange(v: string) {
    setDescription(v);
    const m = recentMerchants.get(v.trim());
    if (m && !touchedCategory && categories.some((c) => c.id === m.category_id)) setCategoryId(m.category_id);
  }

  const schedule = useMemo(() => {
    if (!agorot || agorot <= 0 || method !== "credit_card" || !isValidISODate(date) || count > agorot) return null;
    const parts = splitInstallments(agorot, count);
    const cfg = cardConfigOf(settings);
    return parts.map((a, i) => ({ amount: a, date: installmentChargeDate(date, i, cfg) }));
  }, [agorot, method, date, count, settings]);

  const valid = agorot !== null && agorot > 0 && description.trim() !== "" && categoryId !== "" && isValidISODate(date);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!valid) {
      if (!agorot) toast.error("חסר סכום");
      else if (!description.trim()) {
        toast.error("חסר תיאור");
        descRef.current?.focus();
      } else if (!categoryId) toast.error("נא לבחור קטגוריה");
      return;
    }
    setBusy(true);
    const input: ExpenseInput = {
      id: expense?.id,
      description,
      amount: agorot!,
      category_id: categoryId,
      purchase_date: date,
      payment_method: method,
      installments_count: count,
      notes: notes || null,
    };
    let saved: Expense | null = null;
    let applied: ChangeSet | null = null;
    const key = cycleKeyFor(today);
    const base = snapshot;
    const ok = await run(
      (snap, s) => {
        const r = planned ? convertPlannedToExpense(snap, s, planned.id, input) : saveExpense(snap, s, input);
        saved = r.expense;
        applied = r.changes;
        return r.changes;
      },
      { success: planned ? "סומן כנרכש ונוסף ליומן" : expense ? "ההוצאה עודכנה" : "ההוצאה נשמרה" },
    );
    setBusy(false);
    if (!ok || !saved || !applied) return;
    try {
      window.localStorage.setItem(LAST_METHOD_KEY, method);
    } catch {}
    // Gentle heads-up when this save crossed a budget threshold of the current cycle.
    const before = alertLevel(summarizeCycle(base, settings.accounting_policy, key, today).usagePct);
    const after = alertLevel(summarizeCycle(applyChangeSet(base, applied), settings.accounting_policy, key, today).usagePct);
    if (after > before) {
      const enabled =
        (after === 70 && settings.notify_70) || (after === 90 && settings.notify_90) || (after === 100 && settings.notify_100);
      if (enabled) toast.warning(after === 100 ? "התקציב של המחזור נוצל במלואו" : `נוצלו ${after}% מהתקציב של המחזור`);
    }
    onDone?.(saved);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <AmountInput value={amount} onChange={setAmount} autoFocus={!expense} />

      <div>
        <Input
          ref={descRef}
          placeholder="איפה / על מה?"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          enterKeyHint="done"
          aria-label="תיאור או בית עסק"
          maxLength={120}
        />
        {suggestions.length > 0 ? (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pickMerchant(s)}
                className="shrink-0 rounded-full bg-cream-deep px-3 py-1.5 text-[13px] text-ink transition hover:bg-sage-soft active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-[13px] font-medium text-muted">קטגוריה</p>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((c) => {
            const active = c.id === categoryId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategoryId(c.id);
                  setTouchedCategory(true);
                }}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl p-2.5 text-center text-[12px] leading-tight ring-1 transition active:scale-95",
                  active ? "bg-sage-soft text-forest ring-forest/40" : "bg-card text-ink ring-line/70 hover:bg-cream-deep",
                )}
                aria-pressed={active}
              >
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="line-clamp-2">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[13px] font-medium text-muted">אמצעי תשלום</p>
        <Segmented value={method} onChange={setMethod} options={METHOD_OPTIONS} />
      </div>

      {method === "credit_card" ? (
        <div className="rounded-3xl bg-card p-4 ring-1 ring-line/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">תשלומים</p>
              {schedule ? (
                <p className="mt-0.5 text-xs text-muted">
                  {count > 1 ? (
                    <>
                      <span className="num">{count} × {formatILS(schedule[1]?.amount ?? schedule[0].amount)}</span>
                      {schedule[0].amount !== schedule[schedule.length - 1].amount ? (
                        <> (ראשון <span className="num">{formatILS(schedule[0].amount)}</span>)</>
                      ) : null}
                      {" · "}
                    </>
                  ) : null}
                  חיוב ראשון <span className="num">{formatShortDate(schedule[0].date)}</span>
                  {count > 1 ? (
                    <>
                      {" · "}אחרון <span className="num">{formatShortDate(schedule[schedule.length - 1].date)}</span>
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted">החיוב לפי מועד החיוב של הכרטיס</p>
              )}
            </div>
            <InstallmentStepper value={installments} onChange={setInstallments} />
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-[13px] font-medium text-muted">תאריך רכישה</p>
        <div className="flex gap-2">
          {[
            { label: "היום", value: today },
            { label: "אתמול", value: addDays(today, -1) },
          ].map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => setDate(d.value)}
              className={cn(
                "h-12 shrink-0 rounded-2xl px-4 text-sm font-medium ring-1 transition active:scale-95",
                date === d.value ? "bg-sage-soft text-forest ring-forest/40" : "bg-card ring-line/70",
              )}
            >
              {d.label}
            </button>
          ))}
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-w-0 flex-1" aria-label="תאריך" />
        </div>
      </div>

      {showNotes ? (
        <Field label="הערות">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
      ) : (
        <button type="button" onClick={() => setShowNotes(true)} className="flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ChevronDown className="size-4" /> הוספת הערה
        </button>
      )}

      <div className="sticky bottom-24 z-10 pt-2 sm:bottom-4">
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {planned ? "סימון כנרכש" : expense ? "שמירת שינויים" : "שמירה"}
          {agorot ? <span className="num opacity-80">· {formatILS(agorot)}</span> : null}
        </Button>
      </div>
    </form>
  );
}

