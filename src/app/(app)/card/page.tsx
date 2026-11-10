"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info, Repeat } from "lucide-react";
import { useData } from "@/components/app/data-provider";
import { PageHeader } from "@/components/app/page-header";
import { Money } from "@/components/app/money";
import { ExpenseDetailsDialog, ExpenseRow } from "@/components/app/expense-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { cardForecast } from "@/lib/finance/forecast";
import { formatDM, formatDayMonth, formatShortDate } from "@/lib/dates";
import { formatILS, formatILSCompact } from "@/lib/money";
import { AXIS_TEXT, GRID, SERIES } from "@/lib/chart-colors";
import { Expense } from "@/lib/types";

export default function CardPage() {
  const { snapshot, settings, today } = useData();
  const [selected, setSelected] = useState<Expense | null>(null);
  const f = useMemo(() => cardForecast(snapshot, settings, today, 6), [snapshot, settings, today]);
  const chartData = f.statements.map((s) => ({
    label: formatDM(s.chargeDate),
    date: s.chargeDate,
    actual: s.actualTotal / 100,
    expected: s.expectedRecurringTotal / 100,
  }));
  const hasExpected = f.statements.some((s) => s.expectedRecurringTotal > 0);

  return (
    <div className="space-y-4">
      <PageHeader title="תחזית אשראי" subtitle="מה ירד מהבנק ומתי — בנפרד מניצול התקציב" back="/more" />

      <section className="rounded-[28px] bg-forest p-5 text-forest-ink shadow-[var(--shadow-lift)]">
        <p className="text-sm opacity-75">החיוב הבא · {f.nextChargeDate === today ? "היום, " : ""}{formatDayMonth(f.nextChargeDate)}</p>
        <Money value={f.next.total} className="mt-1 block text-[42px] font-semibold leading-none tracking-tight" />
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs opacity-75">עסקאות שנרשמו</p>
            <Money value={f.next.actualTotal} className="font-semibold" />
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs opacity-75">קבועות צפויות</p>
            <Money value={f.next.expectedRecurringTotal} className="font-semibold" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted">התחייבויות אחרי החיוב הבא</p>
          <Money value={f.futureAfterNext} className="mt-2 block text-xl font-semibold" />
          <p className="mt-0.5 text-[11px] text-muted">תשלומים שנרשמו לחיובים מאוחרים יותר</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">כבר חויב בעסקאות בתשלומים</p>
          <Money value={f.installmentPlans.reduce((s, p) => s + p.paidAmount, 0)} className="mt-2 block text-xl font-semibold" />
          <p className="mt-0.5 text-[11px] text-muted">מתוך עסקאות שעדיין פעילות</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>חיובים צפויים ב-6 החודשים הקרובים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: SERIES[0] }} /> עסקאות שנרשמו
            </span>
            {hasExpected ? (
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: SERIES[1] }} /> קבועות צפויות
              </span>
            ) : null}
          </div>
          <div className="h-52" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" reversed tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} />
                <YAxis orientation="right" tickLine={false} axisLine={false} width={44} tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickFormatter={(v: number) => formatILSCompact(v * 100)} />
                <Tooltip
                  cursor={{ fill: "rgba(47,74,58,0.06)" }}
                  formatter={(v, name) => [formatILS(Math.round(Number(v) * 100)), name === "actual" ? "עסקאות שנרשמו" : "קבועות צפויות"]}
                  labelFormatter={(l) => `חיוב ${l}`}
                  contentStyle={{ borderRadius: 16, border: "1px solid #ebe3d6", direction: "rtl", fontFamily: "inherit" }}
                />
                <Bar dataKey="actual" stackId="a" fill={SERIES[0]} radius={hasExpected ? [0, 0, 0, 0] : [4, 4, 0, 0]} stroke="#fffdf9" strokeWidth={hasExpected ? 1 : 0} />
                {hasExpected ? <Bar dataKey="expected" stackId="a" fill={SERIES[1]} radius={[4, 4, 0, 0]} stroke="#fffdf9" strokeWidth={1} /> : null}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>חיובים צפויים</caption>
            <tbody>
              {f.statements.map((s) => (
                <tr key={s.chargeDate}>
                  <td>{s.chargeDate}</td>
                  <td>{formatILS(s.actualTotal)}</td>
                  <td>{formatILS(s.expectedRecurringTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>מה ירד בחיוב של {formatShortDate(f.nextChargeDate)}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pt-1">
          {f.next.lines.length === 0 && f.next.expectedRecurring.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">אין חיובים רשומים לתאריך הזה</p>
          ) : null}
          {f.next.lines.map((l) => (
            <ExpenseRow
              key={l.installment.id}
              expense={l.expense}
              onClick={() => setSelected(l.expense)}
              subtitle={`נרכש ב-${formatShortDate(l.expense.purchase_date)}`}
              amountOverride={l.expense.installments_count > 1 ? { amount: l.installment.amount, label: `תשלום ${l.installment.number}/${l.expense.installments_count} מתוך ${formatILS(l.expense.amount)}` } : undefined}
            />
          ))}
          {f.next.expectedRecurring.map((x) => (
            <div key={x.occurrence.id} className="flex items-center justify-between rounded-2xl px-2 py-2.5 text-sm opacity-80">
              <span className="flex items-center gap-2">
                <Repeat className="size-4 text-sage-ink" /> {x.rule?.description} <span className="text-xs text-amber">· צפוי</span>
              </span>
              <Money value={x.occurrence.amount} className="font-medium" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>עסקאות בתשלומים</CardTitle>
        </CardHeader>
        <CardContent>
          {f.installmentPlans.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">אין עסקאות פעילות בתשלומים</p>
          ) : (
            <ul className="space-y-4">
              {f.installmentPlans.map((p) => (
                <li key={p.expense.id}>
                  <button type="button" className="w-full text-start" onClick={() => setSelected(p.expense)}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{p.expense.description}</span>
                      <span className="text-xs text-muted">
                        סכום מקורי <Money value={p.expense.amount} className="font-semibold text-ink" />
                      </span>
                    </div>
                    <ProgressBar value={(p.paidCount / p.installments.length) * 100} tone="sage" className="mt-2 h-2" />
                    <div className="mt-1.5 flex justify-between text-[11px] text-muted">
                      <span className="num">
                        {p.paidCount}/{p.installments.length} שולמו · <Money value={p.paidAmount} />
                      </span>
                      <span>
                        נותרו <Money value={p.remainingAmount} className="font-semibold text-ink" />
                        {p.nextCharge?.charge_date ? ` · הבא ${formatShortDate(p.nextCharge.charge_date)}` : ""}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 px-2 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          לפי ההגדרות: החשבון נסגר ב-{settings.card_cutoff_day} לחודש ומחויב ב-{settings.card_billing_day} לחודש. רק עסקאות באשראי נכללות כאן — לא העברות ולא מזומן.{" "}
          <Link href="/settings" className="font-medium text-forest underline underline-offset-4">
            שינוי
          </Link>
        </span>
      </p>

      <ExpenseDetailsDialog expense={selected} open={selected !== null} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}
