"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, List, Repeat, Search, Sparkles, X } from "lucide-react";
import { useData } from "@/components/app/data-provider";
import { PageHeader } from "@/components/app/page-header";
import { CycleSwitcher } from "@/components/app/cycle-switcher";
import { ExpenseDetailsDialog, ExpenseRow } from "@/components/app/expense-item";
import { Money } from "@/components/app/money";
import { CategoryIcon } from "@/components/app/category-icon";
import { Input, NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCycle } from "@/lib/cycle";
import { addDays, dayOfWeek, formatDayMonth, formatShortDate, hebrewDayName, ISODate, parseISODate } from "@/lib/dates";
import { Expense, PAYMENT_METHOD_LABEL, PaymentMethod, RecurringOccurrence } from "@/lib/types";
import { cn } from "@/lib/utils";

type Kind = "all" | "actual" | "recurring" | "expected" | "planned";

export default function JournalPage() {
  const { snapshot, viewCycle, allocations, categoryById, categories, today } = useData();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [method, setMethod] = useState<"" | PaymentMethod>("");
  const [kind, setKind] = useState<Kind>("all");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [day, setDay] = useState<ISODate | null>(null);
  const [selected, setSelected] = useState<Expense | null>(null);

  const cycle = getCycle(viewCycle);
  const query = q.trim();

  const matches = (e: { description: string; notes?: string | null; category_id: string; payment_method: PaymentMethod }) =>
    (!query || e.description.includes(query) || (e.notes ?? "").includes(query)) &&
    (!cat || e.category_id === cat) &&
    (!method || e.payment_method === method);

  const expenses = useMemo(
    () =>
      snapshot.expenses
        .filter((e) => e.purchase_date >= cycle.start && e.purchase_date < cycle.endExclusive)
        .filter(matches)
        .filter((e) => kind === "all" || (kind === "actual" && e.source !== "recurring") || (kind === "recurring" && e.source === "recurring"))
        .filter((e) => !day || e.purchase_date === day)
        .sort((a, b) => (a.purchase_date === b.purchase_date ? (a.created_at < b.created_at ? 1 : -1) : a.purchase_date < b.purchase_date ? 1 : -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.expenses, cycle.start, cycle.endExclusive, query, cat, method, kind, day],
  );

  // Installments of earlier purchases that land in this cycle's budget (cash-flow basis).
  const carried = useMemo(
    () =>
      kind === "all" || kind === "actual"
        ? allocations.filter((a) => a.cycle === viewCycle && a.expense.purchase_date < cycle.start && matches(a.expense) && !day)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allocations, viewCycle, cycle.start, query, cat, method, kind, day],
  );

  const expected = useMemo(() => {
    if (!(kind === "all" || kind === "expected")) return [] as { occ: RecurringOccurrence; description: string; category_id: string; method: PaymentMethod }[];
    return snapshot.recurring_occurrences
      .filter((o) => o.cycle_start === viewCycle && o.status === "expected" && (!day || o.due_date === day))
      .map((o) => {
        const r = snapshot.recurring_rules.find((x) => x.id === o.rule_id);
        return { occ: o, description: r?.description ?? "הוצאה קבועה", category_id: r?.category_id ?? "", method: (r?.payment_method ?? "bank_transfer") as PaymentMethod };
      })
      .filter((x) => matches({ description: x.description, category_id: x.category_id, payment_method: x.method }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.recurring_occurrences, snapshot.recurring_rules, viewCycle, kind, day, query, cat, method]);

  const planned = useMemo(
    () => (kind === "all" || kind === "planned" ? snapshot.planned_purchases.filter((p) => p.status === "planned" && matches(p) && !day) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.planned_purchases, kind, query, cat, method, day],
  );

  const groups = useMemo(() => {
    const map = new Map<ISODate, { expenses: Expense[]; expected: typeof expected }>();
    for (const e of expenses) {
      if (!map.has(e.purchase_date)) map.set(e.purchase_date, { expenses: [], expected: [] });
      map.get(e.purchase_date)!.expenses.push(e);
    }
    for (const x of expected) {
      if (!map.has(x.occ.due_date)) map.set(x.occ.due_date, { expenses: [], expected: [] });
      map.get(x.occ.due_date)!.expected.push(x);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [expenses, expected]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const filtersActive = Boolean(query || cat || method || kind !== "all" || day);

  return (
    <div className="space-y-4">
      <PageHeader
        title="יומן הוצאות"
        action={
          <Segmented
            size="sm"
            className="w-28"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: <List aria-label="רשימה" /> },
              { value: "calendar", label: <CalendarDays aria-label="לוח שנה" /> },
            ]}
          />
        }
      />
      <CycleSwitcher />

      <div className="space-y-2">
        <div className="relative">
          <Input placeholder="חיפוש לפי תיאור או בית עסק" value={q} onChange={(e) => setQ(e.target.value)} className="ps-11" aria-label="חיפוש" />
          <Search className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect value={cat} onChange={(e) => setCat(e.target.value)} aria-label="סינון לפי קטגוריה" className="h-11 text-sm">
            <option value="">כל הקטגוריות</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | "")} aria-label="סינון לפי אמצעי תשלום" className="h-11 text-sm">
            <option value="">כל אמצעי התשלום</option>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {(
            [
              ["all", "הכול"],
              ["actual", "בפועל"],
              ["recurring", "קבועות שאושרו"],
              ["expected", "קבועות צפויות"],
              ["planned", "מתוכננות"],
            ] as [Kind, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition",
                kind === k ? "bg-forest text-forest-ink" : "bg-card text-muted ring-1 ring-line/70",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {day ? (
          <button type="button" onClick={() => setDay(null)} className="flex items-center gap-1 rounded-full bg-sage-soft px-3 py-1 text-[13px] text-forest">
            {formatDayMonth(day)} <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {view === "calendar" ? <CalendarView cycleKey={viewCycle} onPick={(d) => { setDay(d); setView("list"); }} today={today} /> : null}

      {view === "list" ? (
        <>
          <div className="flex items-center justify-between px-1 text-sm text-muted">
            <span>
              {expenses.length} הוצאות{filtersActive ? " תואמות" : ""} שנרכשו במחזור
            </span>
            <Money value={total} className="font-semibold text-ink" />
          </div>

          {groups.length === 0 && carried.length === 0 && planned.length === 0 ? (
            <Card className="py-12 text-center text-sm text-muted">{filtersActive ? "לא נמצאו הוצאות שתואמות לסינון" : "אין הוצאות במחזור הזה"}</Card>
          ) : null}

          {groups.map(([date, g]) => (
            <section key={date}>
              <div className="flex items-center justify-between px-2 pb-1 pt-2">
                <h2 className="text-[13px] font-semibold text-muted">
                  {date === today ? "היום" : date === addDays(today, -1) ? "אתמול" : `יום ${hebrewDayName(date)}`}, {formatDayMonth(date)}
                </h2>
                <Money value={g.expenses.reduce((s, e) => s + e.amount, 0)} className="text-[13px] text-muted" />
              </div>
              <Card className="px-2 py-1">
                {g.expenses.map((e) => (
                  <ExpenseRow key={e.id} expense={e} onClick={() => setSelected(e)} />
                ))}
                {g.expected.map((x) => {
                  const c = categoryById.get(x.category_id);
                  return (
                    <Link key={x.occ.id} href="/recurring" className="flex items-center gap-3 rounded-2xl px-2 py-2.5 opacity-75 transition hover:bg-cream-deep/70">
                      <CategoryIcon icon={c?.icon} color={c?.color} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-medium">{x.description}</span>
                          <Badge variant="amber">
                            <Repeat className="size-3" /> צפוי
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-muted">{x.occ.due_date <= today ? "ממתין לאישור" : "עוד לא ירד · לא נספר בתקציב"}</div>
                      </div>
                      <Money value={x.occ.amount} className="text-[15px] font-semibold text-muted" />
                    </Link>
                  );
                })}
              </Card>
            </section>
          ))}

          {carried.length > 0 ? (
            <section>
              <h2 className="px-2 pb-1 pt-3 text-[13px] font-semibold text-muted">תשלומים מעסקאות קודמות שנזקפים למחזור הזה</h2>
              <Card className="px-2 py-1">
                {carried.map((a) => (
                  <ExpenseRow
                    key={`${a.expense.id}:${a.installmentNumber}`}
                    expense={a.expense}
                    onClick={() => setSelected(a.expense)}
                    subtitle={`נרכש ב-${formatShortDate(a.expense.purchase_date)}`}
                    amountOverride={{ amount: a.amount, label: `תשלום ${a.installmentNumber ?? 1}/${a.expense.installments_count}` }}
                  />
                ))}
              </Card>
            </section>
          ) : null}

          {planned.length > 0 ? (
            <section>
              <h2 className="flex items-center gap-1.5 px-2 pb-1 pt-3 text-[13px] font-semibold text-muted">
                <Sparkles className="size-3.5" /> רכישות מתוכננות · לא נספרות בתקציב
              </h2>
              <Card className="px-2 py-1">
                {planned.map((p) => {
                  const c = categoryById.get(p.category_id);
                  return (
                    <Link key={p.id} href="/what-if#planned" className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-cream-deep/70">
                      <CategoryIcon icon={c?.icon} color={c?.color} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-medium">{p.description}</span>
                          <Badge variant="blush">מתוכנן</Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-muted">{c?.name}</div>
                      </div>
                      <Money value={p.amount} className="text-[15px] font-semibold text-muted" />
                    </Link>
                  );
                })}
              </Card>
            </section>
          ) : null}
        </>
      ) : null}

      <ExpenseDetailsDialog expense={selected} open={selected !== null} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function CalendarView({ cycleKey, onPick, today }: { cycleKey: string; onPick: (d: ISODate) => void; today: ISODate }) {
  const { snapshot } = useData();
  const cycle = getCycle(cycleKey);
  const totals = new Map<ISODate, number>();
  for (const e of snapshot.expenses) {
    if (e.purchase_date >= cycle.start && e.purchase_date < cycle.endExclusive) totals.set(e.purchase_date, (totals.get(e.purchase_date) ?? 0) + e.amount);
  }
  const expectedDays = new Set(snapshot.recurring_occurrences.filter((o) => o.cycle_start === cycleKey && o.status === "expected").map((o) => o.due_date));
  const max = Math.max(1, ...totals.values());
  const days: ISODate[] = [];
  for (let d = cycle.start; d < cycle.endExclusive; d = addDays(d, 1)) days.push(d);
  const lead = dayOfWeek(cycle.start); // Sunday-first week, rendered right-to-left
  return (
    <Card className="p-3">
      <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-medium text-muted">
        {["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const t = totals.get(d) ?? 0;
          const intensity = t ? 0.15 + 0.6 * (t / max) : 0;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-xl text-[12px] transition active:scale-95",
                d === today && "ring-2 ring-forest",
              )}
              style={{ backgroundColor: t ? `rgba(31,122,85,${intensity})` : "var(--cream)" }}
              aria-label={`${formatDayMonth(d)}${t ? ` — ${(t / 100).toFixed(0)} ₪` : ""}`}
            >
              <span className={cn("font-semibold", intensity > 0.5 ? "text-white" : "text-ink")}>{parseISODate(d).d}</span>
              {t ? (
                <span className={cn("num text-[9px]", intensity > 0.5 ? "text-white/90" : "text-muted")}>{Math.round(t / 100)}</span>
              ) : expectedDays.has(d) ? (
                <Repeat className="size-2.5 text-amber" />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">הצבע מעיד על סך ההוצאות ביום · ↻ תשלום קבוע צפוי · לחיצה על יום מציגה את ההוצאות שבו</p>
    </Card>
  );
}
