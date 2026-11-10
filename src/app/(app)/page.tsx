"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, CreditCard, Plus, Repeat, Sparkles, WandSparkles, Wallet } from "lucide-react";
import { useData } from "@/components/app/data-provider";
import { CycleSwitcher } from "@/components/app/cycle-switcher";
import { BudgetNotifications } from "@/components/app/notifications";
import { BrandMark, BrandName } from "@/components/app/brand";
import { Money } from "@/components/app/money";
import { CategoryBars } from "@/components/app/category-bars";
import { ExpenseDetailsDialog, ExpenseRow } from "@/components/app/expense-item";
import { BudgetEditDialog } from "@/components/app/budget-edit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { plannedTotal, remainingInstallmentCommitments, summarizeCycle } from "@/lib/finance/budget";
import { cardForecast } from "@/lib/finance/forecast";
import { formatDayMonth, formatShortDate, hebrewDayName } from "@/lib/dates";
import { Expense } from "@/lib/types";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }).format(new Date()));
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

export default function DashboardPage() {
  const { snapshot, settings, today, viewCycle, currentCycle, allocations, categoryById } = useData();
  const [selected, setSelected] = useState<Expense | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const summary = useMemo(
    () => summarizeCycle(snapshot, settings.accounting_policy, viewCycle, today, allocations),
    [snapshot, settings.accounting_policy, viewCycle, today, allocations],
  );
  const forecast = useMemo(() => cardForecast(snapshot, settings, today, 3), [snapshot, settings, today]);
  const commitments = useMemo(() => remainingInstallmentCommitments(snapshot, today), [snapshot, today]);
  const planned = snapshot.planned_purchases.filter((p) => p.status === "planned");
  const isCurrent = viewCycle === currentCycle;
  const usage = summary.usagePct ?? 0;
  const recurringConsumed = summary.allocations.filter((a) => a.expense.source === "recurring").reduce((s, a) => s + a.amount, 0);
  const pacePct =
    summary.budget && summary.expectedPaceConsumed !== null
      ? ((summary.expectedPaceConsumed + recurringConsumed) / summary.budget) * 100
      : null;
  const currentSummary = useMemo(
    () => (isCurrent ? summary : summarizeCycle(snapshot, settings.accounting_policy, currentCycle, today, allocations)),
    [isCurrent, summary, snapshot, settings.accounting_policy, currentCycle, today, allocations],
  );

  const recent = useMemo(
    () =>
      summary.allocations
        .slice()
        .sort((a, b) => (a.expense.purchase_date === b.expense.purchase_date ? (a.expense.created_at < b.expense.created_at ? 1 : -1) : a.expense.purchase_date < b.expense.purchase_date ? 1 : -1))
        .slice(0, 5),
    [summary.allocations],
  );

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <BrandMark className="size-11" />
          <div>
            <BrandName />
            <p className="mt-1 text-xs text-muted">
              {greeting()} · יום {hebrewDayName(today)}, {formatDayMonth(today)}
            </p>
          </div>
        </div>
      </header>

      <CycleSwitcher />
      {isCurrent ? <BudgetNotifications className="mb-0" /> : null}

      {/* Hero: remaining budget */}
      <section className="animate-rise overflow-hidden rounded-[28px] bg-forest p-5 text-forest-ink shadow-[var(--shadow-lift)]">
        {summary.budget === null ? (
          <div className="space-y-3">
            <p className="text-sm opacity-80">לא הוגדר תקציב למחזור הזה</p>
            <p className="text-sm opacity-80">
              נוצלו <Money value={summary.consumed} className="font-semibold" />
            </p>
            <Button variant="blush" size="sm" onClick={() => setBudgetOpen(true)}>
              הגדרת תקציב מהמחזור הזה
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm opacity-75">{summary.remaining! >= 0 ? "נשאר בתקציב" : "חריגה מהתקציב"}</p>
                <Money value={Math.abs(summary.remaining!)} className={cn("mt-1 block text-[44px] font-semibold leading-none tracking-tight", summary.remaining! < 0 && "text-blush")} />
              </div>
              <button
                type="button"
                onClick={() => setBudgetOpen(true)}
                className="rounded-2xl bg-white/10 px-3 py-2 text-end text-xs transition hover:bg-white/15"
                aria-label="עריכת התקציב החודשי"
              >
                <span className="block opacity-70">תקציב חודשי</span>
                <Money value={summary.budget} className="text-sm font-semibold" />
              </button>
            </div>
            <div className="mt-5">
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={Math.round(usage)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={cn("h-full rounded-full transition-[width] duration-700", usage >= 100 ? "bg-blush" : usage >= 90 ? "bg-[#e9c27a]" : "bg-[#cfe0c9]")}
                  style={{ width: `${Math.min(100, usage)}%` }}
                />
                {isCurrent && pacePct !== null ? (
                  <div className="absolute top-0 h-full w-0.5 bg-white/70" style={{ insetInlineStart: `${Math.min(100, pacePct)}%` }} title="קצב אחיד" />
                ) : null}
              </div>
              <div className="mt-2 flex justify-between text-xs opacity-80">
                <span>
                  נוצלו <Money value={summary.consumed} className="font-semibold" /> · <span className="num">{Math.round(usage)}%</span>
                </span>
                <span>
                  {summary.progress.status === "current"
                    ? summary.progress.remainingDays === 1
                      ? "היום האחרון במחזור"
                      : `נותרו ${summary.progress.remainingDays} ימים`
                    : summary.progress.status === "past"
                      ? "המחזור הסתיים"
                      : "מחזור עתידי"}
                </span>
              </div>
            </div>
            {summary.expectedRecurringTotal > 0 && summary.freeToSpend !== null ? (
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/10 px-3.5 py-2.5 text-sm">
                <span className="opacity-85">
                  פנוי אחרי הוצאות קבועות שעוד יירדו (<Money value={summary.expectedRecurringTotal} />)
                </span>
                <Money value={summary.freeToSpend} className="font-semibold" />
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/what-if"
          className="flex items-center gap-3 rounded-3xl bg-blush p-4 text-blush-ink shadow-[var(--shadow-soft)] transition active:scale-[0.98]"
        >
          <WandSparkles className="size-6 shrink-0" />
          <span>
            <span className="block text-[15px] font-semibold">מה אם אקנה?</span>
            <span className="text-xs opacity-80">לבדוק לפני שקונים</span>
          </span>
        </Link>
        <Link href="/new" className="flex items-center gap-3 rounded-3xl bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-line/60 transition active:scale-[0.98]">
          <Plus className="size-6 shrink-0 text-forest" />
          <span>
            <span className="block text-[15px] font-semibold">הוצאה חדשה</span>
            <span className="text-xs text-muted">רישום מהיר</span>
          </span>
        </Link>
      </div>

      {/* Key figures */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          href="/card"
          icon={CreditCard}
          label="החיוב הבא באשראי"
          value={forecast.next.total}
          sub={`ב-${formatShortDate(forecast.nextChargeDate)}${forecast.next.expectedRecurringTotal > 0 ? " · כולל קבועות צפויות" : ""}`}
        />
        <StatTile
          href="/recurring"
          icon={Repeat}
          label="קבועות שעוד יירדו"
          value={currentSummary.expectedRecurringTotal}
          sub={`${currentSummary.expectedRecurring.length} תשלומים במחזור הנוכחי`}
        />
        <StatTile href="/card" icon={CalendarClock} label="יתרת תשלומים עתידיים" value={commitments} sub={`${forecast.installmentPlans.length} עסקאות בתשלומים`} />
        <StatTile href="/what-if" icon={Sparkles} label="רכישות מתוכננות" value={plannedTotal(planned)} sub={planned.length ? `${planned.length} פריטים · לא נספרות בתקציב` : "אין כרגע"} tone="blush" />
      </div>

      {/* Category spending */}
      <Card>
        <CardHeader>
          <CardTitle>לאן הכסף הולך</CardTitle>
          <Link href="/insights" className="flex items-center gap-1 text-xs font-medium text-forest">
            לתובנות <ArrowLeft className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          <CategoryBars data={summary.byCategory} />
        </CardContent>
      </Card>

      {/* Upcoming recurring in view cycle */}
      {summary.expectedRecurring.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>הוצאות קבועות צפויות</CardTitle>
            <Link href="/recurring" className="flex items-center gap-1 text-xs font-medium text-forest">
              לכל הקבועות <ArrowLeft className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-1">
            <ul className="divide-y divide-line/60">
              {summary.expectedRecurring.slice(0, 5).map((o) => {
                const rule = snapshot.recurring_rules.find((r) => r.id === o.rule_id);
                return (
                  <li key={o.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="flex items-center gap-2">
                      <Repeat className="size-4 text-sage-ink" />
                      {rule?.description ?? "הוצאה קבועה"}
                      <span className={cn("text-xs", o.due_date < today ? "text-amber" : "text-muted")}>
                        {o.due_date < today ? "· ממתין לאישור" : `· ${formatShortDate(o.due_date)}`}
                      </span>
                    </span>
                    <Money value={o.amount} className="font-medium" />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Recent */}
      <Card>
        <CardHeader>
          <CardTitle>אחרונות במחזור</CardTitle>
          <Link href="/journal" className="flex items-center gap-1 text-xs font-medium text-forest">
            ליומן <ArrowLeft className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="px-3 pt-1">
          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Wallet className="size-8 text-sage" />
              <p className="text-sm text-muted">עוד לא נרשמו הוצאות במחזור הזה</p>
              {isCurrent ? (
                <Button asChild size="sm">
                  <Link href="/new">רישום הוצאה ראשונה</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            recent.map((a) => (
              <ExpenseRow
                key={`${a.expense.id}:${a.installmentNumber}`}
                expense={a.expense}
                onClick={() => setSelected(a.expense)}
                subtitle={`${categoryById.get(a.expense.category_id)?.name ?? ""} · ${formatShortDate(a.expense.purchase_date)}`}
                amountOverride={
                  a.installmentNumber !== null && a.expense.installments_count > 1
                    ? { amount: a.amount, label: `תשלום ${a.installmentNumber}/${a.expense.installments_count}` }
                    : undefined
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <ExpenseDetailsDialog expense={selected} open={selected !== null} onOpenChange={(o) => !o && setSelected(null)} />
      <BudgetEditDialog open={budgetOpen} onOpenChange={setBudgetOpen} cycle={viewCycle} />
    </div>
  );
}

function StatTile({
  href,
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  href: string;
  icon: typeof CreditCard;
  label: string;
  value: number;
  sub: string;
  tone?: "blush";
}) {
  return (
    <Link href={href} className="group rounded-3xl bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-line/60 transition active:scale-[0.98]">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <span className={cn("grid size-7 place-items-center rounded-xl", tone === "blush" ? "bg-blush-soft text-blush-ink" : "bg-sage-soft text-forest")}>
          <Icon className="size-4" />
        </span>
        {label}
      </div>
      <Money value={value} className="mt-3 block text-[22px] font-semibold tracking-tight" />
      <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>
    </Link>
  );
}

