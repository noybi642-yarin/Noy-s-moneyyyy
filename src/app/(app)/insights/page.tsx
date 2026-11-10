"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Lightbulb, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useData } from "@/components/app/data-provider";
import { PageHeader } from "@/components/app/page-header";
import { CycleSwitcher } from "@/components/app/cycle-switcher";
import { Money } from "@/components/app/money";
import { CategoryBars } from "@/components/app/category-bars";
import { CategoryIcon } from "@/components/app/category-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cycleTotals, generateInsights } from "@/lib/finance/insights";
import { cycleKeysBetween, cycleShortLabel, getCycle, shiftCycleKey, cycleLabel } from "@/lib/cycle";
import { addDays, diffDays, formatShortDate } from "@/lib/dates";
import { formatILS, formatILSCompact } from "@/lib/money";
import { AXIS_TEXT, GRID, SERIES } from "@/lib/chart-colors";
import { PAYMENT_METHOD_LABEL, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

const tooltipStyle = { borderRadius: 16, border: "1px solid #ebe3d6", direction: "rtl" as const, fontFamily: "inherit", fontSize: 13 };

export default function InsightsPage() {
  const { snapshot, settings, today, viewCycle, currentCycle, allocations, categoryById } = useData();
  const insights = useMemo(() => generateInsights(snapshot, settings, today), [snapshot, settings, today]);

  const months = useMemo(() => cycleKeysBetween(shiftCycleKey(viewCycle, -5), viewCycle), [viewCycle]);
  const totals = useMemo(() => cycleTotals(snapshot, allocations, months), [snapshot, allocations, months]);
  const cur = totals[totals.length - 1];
  const prev = totals[totals.length - 2];
  const hasAny = totals.some((t) => t.consumed > 0);

  const monthly = totals.map((t) => ({
    label: cycleShortLabel(t.key),
    key: t.key,
    consumed: t.consumed / 100,
    budget: t.budget !== null ? t.budget / 100 : null,
    over: t.budget !== null && t.consumed > t.budget,
  }));
  const latestBudget = cur.budget;

  // Cumulative spending by day: this cycle vs previous cycle.
  const trend = useMemo(() => {
    const c = getCycle(viewCycle);
    const p = getCycle(shiftCycleKey(viewCycle, -1));
    const sumBy = (key: string, start: string) => {
      const arr = new Array(31).fill(0);
      for (const a of allocations) {
        if (a.cycle !== key) continue;
        const first = a.installmentNumber === null || a.installmentNumber === 1;
        const off = first ? Math.max(0, diffDays(start, a.expense.purchase_date)) : 0;
        if (off < 31) arr[off] += a.amount;
      }
      let run = 0;
      return arr.map((v) => (run += v));
    };
    const curArr = sumBy(c.key, c.start);
    const prevArr = sumBy(p.key, p.start);
    const prevHasData = prevArr[prevArr.length - 1] > 0;
    const lastDay = viewCycle === currentCycle ? diffDays(c.start, today) : c.totalDays - 1;
    return Array.from({ length: Math.max(c.totalDays, p.totalDays) }, (_, i) => ({
      day: i + 1,
      current: i <= lastDay && i < c.totalDays ? curArr[i] / 100 : null,
      previous: prevHasData && i < p.totalDays ? prevArr[i] / 100 : null,
    }));
  }, [allocations, viewCycle, currentCycle, today]);

  const largest = useMemo(
    () =>
      snapshot.expenses
        .filter((e) => e.purchase_date >= getCycle(viewCycle).start && e.purchase_date < getCycle(viewCycle).endExclusive)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    [snapshot.expenses, viewCycle],
  );

  const overages = useMemo(() => {
    const keys = cycleKeysBetween(shiftCycleKey(currentCycle, -11), shiftCycleKey(currentCycle, -1));
    return cycleTotals(snapshot, allocations, keys).filter((t) => t.budget !== null && t.consumed > t.budget);
  }, [snapshot, allocations, currentCycle]);

  const converted = snapshot.planned_purchases.filter((p) => p.status === "purchased");
  const convertedTotal = converted.reduce((s, p) => s + (snapshot.expenses.find((e) => e.id === p.expense_id)?.amount ?? p.amount), 0);

  const byCategory = [...cur.byCategory.entries()].map(([categoryId, spent]) => ({ categoryId, spent }));

  return (
    <div className="space-y-4">
      <PageHeader title="תובנות" subtitle="לאן הכסף הולך — בלי שיפוטיות" />
      <CycleSwitcher />

      {insights.length > 0 && viewCycle === currentCycle ? (
        <Card className="bg-sage-soft/60">
          <CardContent className="space-y-3 pt-5">
            {insights.map((i) => (
              <div key={i.id} className="flex items-start gap-2.5">
                {i.tone === "positive" ? (
                  <TrendingDown className="mt-0.5 size-4 shrink-0 text-sage-ink" />
                ) : i.tone === "attention" ? (
                  <TrendingUp className="mt-0.5 size-4 shrink-0 text-amber" />
                ) : (
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-forest" />
                )}
                <p className="text-sm leading-relaxed text-ink">{i.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : viewCycle === currentCycle ? (
        <Card className="p-5 text-center text-sm text-muted">
          <Lightbulb className="mx-auto mb-2 size-6 text-sage" />
          תובנות יופיעו כשיצטברו מספיק נתונים — בדרך כלל אחרי כמה הוצאות ומחזור אחד שלם להשוואה.
        </Card>
      ) : null}

      {!hasAny ? (
        <Card className="py-12 text-center text-sm text-muted">אין עדיין הוצאות להצגה בתקופה הזו</Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>השוואה חודשית</CardTitle>
              {prev && prev.consumed > 0 ? (
                <span className="text-xs text-muted">
                  לעומת קודם:{" "}
                  <span className={cn("num font-semibold", cur.consumed > prev.consumed ? "text-ink" : "text-sage-ink")}>
                    {cur.consumed >= prev.consumed ? "+" : "−"}
                    {formatILS(Math.abs(cur.consumed - prev.consumed))}
                  </span>
                </span>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="h-52" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="30%">
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" reversed tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} />
                    <YAxis
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                      tickFormatter={(v: number) => formatILSCompact(v * 100)}
                      domain={[0, (max: number) => Math.max(max, (latestBudget ?? 0) / 100)]}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(47,74,58,0.06)" }}
                      contentStyle={tooltipStyle}
                      formatter={(v, _n, item) => {
                        const b = (item?.payload as { budget: number | null }).budget;
                        return [`${formatILS(Math.round(Number(v) * 100))}${b !== null ? ` מתוך ${formatILS(Math.round(b * 100))}` : ""}`, "נוצל"];
                      }}
                    />
                    {latestBudget !== null ? <ReferenceLine y={latestBudget / 100} stroke="#7d786d" strokeDasharray="4 4" /> : null}
                    <Bar dataKey="consumed" radius={[4, 4, 0, 0]}>
                      {monthly.map((m) => (
                        <Cell key={m.key} fill={m.over ? "#b8503f" : SERIES[0]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[11px] text-muted">קו מקווקו = התקציב הנוכחי · עמודה אדומה = מחזור שחרג מהתקציב שלו</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>קצב ההוצאות במחזור</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded" style={{ background: SERIES[0] }} /> {cycleLabel(viewCycle)}
                </span>
                {trend.some((t) => t.previous !== null) ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded" style={{ background: SERIES[1] }} /> {cycleLabel(shiftCycleKey(viewCycle, -1))}
                  </span>
                ) : (
                  <span>אין נתונים מהמחזור הקודם להשוואה</span>
                )}
              </div>
              <div className="h-48" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="day" reversed tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} interval={4} />
                    <YAxis
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                      tickFormatter={(v: number) => formatILSCompact(v * 100)}
                      domain={[0, (max: number) => Math.max(max, (latestBudget ?? 0) / 100)]}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(d) => `יום ${d} במחזור · ${formatShortDate(addDays(getCycle(viewCycle).start, Number(d) - 1))}`}
                      formatter={(v, n) => [formatILS(Math.round(Number(v) * 100)), n === "current" ? "המחזור הזה" : "המחזור הקודם"]}
                    />
                    {latestBudget !== null ? <ReferenceLine y={latestBudget / 100} stroke="#7d786d" strokeDasharray="4 4" /> : null}
                    <Line type="linear" dataKey="previous" stroke={SERIES[1]} strokeWidth={2} dot={false} connectNulls={false} />
                    <Line type="linear" dataKey="current" stroke={SERIES[0]} strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>לפי קטגוריה</CardTitle>
              <Money value={cur.consumed} className="text-sm font-semibold" />
            </CardHeader>
            <CardContent>
              <CategoryBars data={byCategory} />
              {prev && prev.consumed > 0 && byCategory.length > 0 ? (
                <div className="mt-4 rounded-2xl bg-cream-deep/60 p-3">
                  <p className="mb-2 text-xs font-medium text-muted">שינוי מול {cycleLabel(prev.key)}</p>
                  <ul className="space-y-1.5 text-sm">
                    {byCategory
                      .map((c) => ({ ...c, prev: prev.byCategory.get(c.categoryId) ?? 0 }))
                      .filter((c) => c.prev > 0)
                      .sort((a, b) => Math.abs(b.spent - b.prev) - Math.abs(a.spent - a.prev))
                      .slice(0, 4)
                      .map((c) => (
                        <li key={c.categoryId} className="flex justify-between">
                          <span className="truncate">{categoryById.get(c.categoryId)?.name}</span>
                          <span className={cn("num text-xs", c.spent <= c.prev ? "text-sage-ink" : "text-ink")}>
                            {c.spent >= c.prev ? "+" : "−"}
                            {formatILS(Math.abs(c.spent - c.prev))}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>אמצעי תשלום</CardTitle>
              </CardHeader>
              <CardContent>
                <SplitBar
                  parts={(Object.keys(cur.byMethod) as PaymentMethod[]).map((m, i) => ({ label: PAYMENT_METHOD_LABEL[m], value: cur.byMethod[m], color: SERIES[i] }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>קבועות מול משתנות</CardTitle>
              </CardHeader>
              <CardContent>
                <SplitBar
                  parts={[
                    { label: "קבועות", value: cur.recurring, color: SERIES[0] },
                    { label: "משתנות", value: cur.variable, color: SERIES[1] },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>קניות ופינוקים</CardTitle>
              </CardHeader>
              <CardContent>
                <SplitBar
                  parts={[
                    { label: "פינוקים וגמישות", value: cur.discretionary, color: SERIES[1] },
                    { label: "שאר ההוצאות", value: cur.consumed - cur.discretionary, color: SERIES[0] },
                  ]}
                />
                <p className="mt-2 text-[11px] text-muted">לפי הקטגוריות שמסומנות כ״פינוקים״ במסך הקטגוריות.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>מתוכנן ← נקנה</CardTitle>
                <Sparkles className="size-4 text-blush-ink" />
              </CardHeader>
              <CardContent>
                {converted.length === 0 ? (
                  <p className="text-sm text-muted">עוד לא סומנו רכישות מתוכננות כנקנו.</p>
                ) : (
                  <p className="text-sm">
                    <span className="num font-semibold">{converted.length}</span> רכישות שתוכננו מראש נקנו בסך <Money value={convertedTotal} className="font-semibold" />.
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {snapshot.planned_purchases.filter((p) => p.status === "planned").length} עדיין ברשימה
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>ההוצאות הגדולות במחזור</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {largest.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">אין הוצאות במחזור הזה</p>
              ) : (
                <ol className="divide-y divide-line/60">
                  {largest.map((e) => {
                    const c = categoryById.get(e.category_id);
                    return (
                      <li key={e.id} className="flex items-center gap-3 py-2.5">
                        <CategoryIcon icon={c?.icon} color={c?.color} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{e.description}</span>
                          <span className="text-xs text-muted">
                            {formatShortDate(e.purchase_date)}
                            {e.installments_count > 1 ? ` · ${e.installments_count} תשלומים` : ""}
                          </span>
                        </span>
                        <Money value={e.amount} className="text-sm font-semibold" />
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>חריגות מהתקציב (12 מחזורים אחרונים)</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {overages.length === 0 ? (
                <p className="text-sm text-muted">אין חריגות במחזורים שהסתיימו. 🌿</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {overages.map((o) => (
                    <li key={o.key} className="flex justify-between py-2.5 text-sm">
                      <span>{cycleLabel(o.key)}</span>
                      <span className="text-xs text-muted">
                        חריגה של <Money value={o.consumed - (o.budget ?? 0)} className="font-semibold text-danger" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return <p className="text-sm text-muted">אין נתונים</p>;
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} title={`${p.label}: ${formatILS(p.value)}`} />
          ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
            <span className="flex-1">{p.label}</span>
            <span className="num text-xs text-muted">{Math.round((Math.max(0, p.value) / total) * 100)}%</span>
            <Money value={p.value} className="w-20 text-end font-medium" />
          </li>
        ))}
      </ul>
    </div>
  );
}
