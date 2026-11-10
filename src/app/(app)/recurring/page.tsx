"use client";

import { useMemo, useState } from "react";
import { Check, Pause, Pencil, Plus, Repeat, SkipForward, Trash2, Undo2 } from "lucide-react";
import { useData } from "@/components/app/data-provider";
import { PageHeader } from "@/components/app/page-header";
import { CycleSwitcher } from "@/components/app/cycle-switcher";
import { Money } from "@/components/app/money";
import { CategoryIcon } from "@/components/app/category-icon";
import { AmountInput } from "@/components/app/amount-input";
import { METHOD_OPTIONS } from "@/components/app/expense-form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  confirmOccurrence,
  deleteRecurringRule,
  editOccurrence,
  saveRecurringRule,
  setOccurrenceSkipped,
} from "@/lib/finance/mutations";
import { overdueOccurrences } from "@/lib/finance/recurring";
import { agorotToInput, parseShekelsToAgorot } from "@/lib/money";
import { formatShortDate, isValidISODate } from "@/lib/dates";
import { cycleLabel } from "@/lib/cycle";
import { PAYMENT_METHOD_LABEL, PaymentMethod, RecurringOccurrence, RecurringRule } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function RecurringPage() {
  const { snapshot, viewCycle, today, categoryById, run } = useData();
  const [editingRule, setEditingRule] = useState<RecurringRule | "new" | null>(null);
  const [editingOcc, setEditingOcc] = useState<RecurringOccurrence | null>(null);
  const [deleting, setDeleting] = useState<RecurringRule | null>(null);

  const rules = [...snapshot.recurring_rules].sort((a, b) => Number(b.active) - Number(a.active) || a.day_of_month - b.day_of_month);
  const ruleById = new Map(snapshot.recurring_rules.map((r) => [r.id, r]));
  const occurrences = useMemo(
    () => snapshot.recurring_occurrences.filter((o) => o.cycle_start === viewCycle).sort((a, b) => (a.due_date < b.due_date ? -1 : 1)),
    [snapshot.recurring_occurrences, viewCycle],
  );
  const overdueOther = overdueOccurrences(snapshot, today).filter((o) => o.cycle_start !== viewCycle);
  const expectedTotal = occurrences.filter((o) => o.status === "expected").reduce((s, o) => s + o.amount, 0);
  const confirmedTotal = occurrences.filter((o) => o.status === "confirmed").reduce((s, o) => s + o.amount, 0);

  const confirm = (o: RecurringOccurrence) => run((snap, s) => confirmOccurrence(snap, s, o.id).changes, { success: "אושר ונוסף ליומן" });

  const OccRow = ({ o, showCycle }: { o: RecurringOccurrence; showCycle?: boolean }) => {
    const rule = ruleById.get(o.rule_id);
    const cat = categoryById.get(rule?.category_id ?? "");
    const due = o.due_date <= today;
    return (
      <li className="py-3">
        <div className="flex items-center gap-3">
          <CategoryIcon icon={cat?.icon} color={cat?.color} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
              {rule?.description ?? "הוצאה קבועה"}
              {o.is_overridden && o.status !== "confirmed" ? <Badge>נערך</Badge> : null}
            </p>
            <p className="text-xs text-muted">
              {showCycle ? `${cycleLabel(o.cycle_start)} · ` : ""}
              {formatShortDate(o.due_date)} · {rule ? PAYMENT_METHOD_LABEL[rule.payment_method] : ""}
            </p>
          </div>
          <div className="text-end">
            <Money value={o.amount} className={cn("font-semibold", o.status === "skipped" && "text-muted line-through")} />
            <div className="mt-0.5">
              {o.status === "confirmed" ? (
                <Badge variant="sage">
                  <Check className="size-3" /> שולם
                </Badge>
              ) : o.status === "skipped" ? (
                <Badge>דולג</Badge>
              ) : due ? (
                <Badge variant="amber">ממתין לאישור</Badge>
              ) : (
                <Badge variant="default">צפוי</Badge>
              )}
            </div>
          </div>
        </div>
        {o.status === "expected" ? (
          <div className="mt-2 flex gap-1.5 ps-11">
            <Button size="sm" variant={due ? "default" : "secondary"} onClick={() => confirm(o)}>
              <Check /> {due ? "אישור תשלום" : "שולם מוקדם"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingOcc(o)}>
              <Pencil /> רק החודש
            </Button>
            <Button size="sm" variant="ghost" onClick={() => run((snap) => setOccurrenceSkipped(snap, o.id, true), { success: "דולג החודש" })}>
              <SkipForward /> דילוג
            </Button>
          </div>
        ) : o.status === "skipped" ? (
          <div className="mt-2 ps-11">
            <Button size="sm" variant="ghost" onClick={() => run((snap) => setOccurrenceSkipped(snap, o.id, false))}>
              <Undo2 /> ביטול הדילוג
            </Button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="הוצאות קבועות"
        subtitle="גן, מנויים, ביטוחים והוראות קבע"
        back="/more"
        action={
          <Button size="sm" onClick={() => setEditingRule("new")}>
            <Plus /> חדשה
          </Button>
        }
      />

      {overdueOther.length > 0 ? (
        <Card className="ring-amber/30">
          <CardHeader>
            <CardTitle>ממתינים לאישור ממחזורים אחרים</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-line/60">
              {overdueOther.map((o) => (
                <OccRow key={o.id} o={o} showCycle />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <CycleSwitcher />
      <Card>
        <CardHeader>
          <CardTitle>תשלומים במחזור</CardTitle>
          <span className="text-xs text-muted">
            שולמו <Money value={confirmedTotal} className="font-semibold text-ink" /> · צפויים <Money value={expectedTotal} className="font-semibold text-ink" />
          </span>
        </CardHeader>
        <CardContent className="pt-0">
          {occurrences.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{rules.length ? "אין תשלומים קבועים במחזור הזה" : "עוד לא הוגדרו הוצאות קבועות"}</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {occurrences.map((o) => (
                <OccRow key={o.id} o={o} />
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            תשלום צפוי לא נספר בניצול התקציב, אבל נשמר בצד ביתרה ״הפנויה״. אחרי אישור הוא עובר ליומן ונספר פעם אחת.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ההוראות שלי</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Repeat className="size-8 text-sage" />
              <p className="text-sm text-muted">כאן מגדירים תשלום פעם אחת, והוא יופיע אוטומטית בכל מחזור.</p>
              <Button size="sm" onClick={() => setEditingRule("new")}>
                <Plus /> הוספת הוצאה קבועה
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-line/60">
              {rules.map((r) => {
                const cat = categoryById.get(r.category_id);
                return (
                  <li key={r.id} className={cn("flex items-center gap-3 py-3", !r.active && "opacity-60")}>
                    <CategoryIcon icon={cat?.icon} color={cat?.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                        {r.description}
                        {!r.active ? (
                          <Badge>
                            <Pause className="size-3" /> מושהה
                          </Badge>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted">
                        כל {r.day_of_month} לחודש · {PAYMENT_METHOD_LABEL[r.payment_method]}
                        {r.end_date ? ` · עד ${formatShortDate(r.end_date)}` : ""}
                      </p>
                    </div>
                    <Money value={r.amount} className="font-semibold" />
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditingRule(r)} aria-label="עריכה">
                      <Pencil />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={editingRule !== null} onOpenChange={(o) => !o && setEditingRule(null)}>
        <DialogContent
          title={editingRule === "new" ? "הוצאה קבועה חדשה" : "עריכת הוצאה קבועה"}
          description={editingRule === "new" ? undefined : "השינוי חל על תשלומים עתידיים שטרם אושרו. תשלומים שאושרו ותשלומים שנערכו בנפרד לא משתנים."}
        >
          {editingRule !== null ? (
            <RuleForm
              rule={editingRule === "new" ? null : editingRule}
              onDone={() => setEditingRule(null)}
              onDelete={(r) => {
                setEditingRule(null);
                setDeleting(r);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editingOcc !== null} onOpenChange={(o) => !o && setEditingOcc(null)}>
        <DialogContent title="עריכת התשלום הזה בלבד" description="ההוראה הקבועה עצמה לא תשתנה.">
          {editingOcc ? <OccurrenceForm occ={editingOcc} onDone={() => setEditingOcc(null)} /> : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="למחוק את ההוצאה הקבועה?"
        description="תשלומים צפויים יימחקו. תשלומים שכבר אושרו יישארו ביומן ההוצאות."
        confirmLabel="מחיקה"
        danger
        onConfirm={() => run((snap) => deleteRecurringRule(snap, deleting!.id), { success: "נמחק" })}
      />
    </div>
  );
}

function RuleForm({ rule, onDone, onDelete }: { rule: RecurringRule | null; onDone: () => void; onDelete: (r: RecurringRule) => void }) {
  const { categories, today, run } = useData();
  const fixed = categories.find((c) => c.name.includes("קבועות"))?.id ?? categories[0]?.id ?? "";
  const [description, setDescription] = useState(rule?.description ?? "");
  const [amount, setAmount] = useState(rule ? agorotToInput(rule.amount) : "");
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? fixed);
  const [method, setMethod] = useState<PaymentMethod>(rule?.payment_method ?? "bank_transfer");
  const [day, setDay] = useState(String(rule?.day_of_month ?? 10));
  const [start, setStart] = useState(rule?.start_date ?? today);
  const [end, setEnd] = useState(rule?.end_date ?? "");
  const [active, setActive] = useState(rule?.active ?? true);
  const a = parseShekelsToAgorot(amount);
  const d = parseInt(day, 10);
  const valid = a && a > 0 && description.trim() && d >= 1 && d <= 31 && isValidISODate(start) && (!end || isValidISODate(end));

  return (
    <div className="space-y-4">
      <AmountInput size="md" value={amount} onChange={setAmount} autoFocus={!rule} />
      <Field label="תיאור">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="למשל: גן ילדים" />
      </Field>
      <Field label="קטגוריה">
        <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="אמצעי תשלום">
        <Segmented size="sm" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="יום בחודש">
          <Input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </Field>
        <Field label="התחלה">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="px-2 text-sm" />
        </Field>
        <Field label="סיום (רשות)">
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="px-2 text-sm" />
        </Field>
      </div>
      <label className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 ring-1 ring-line/60">
        <span className="text-sm">פעילה</span>
        <Switch checked={active} onCheckedChange={setActive} />
      </label>
      <Button
        className="w-full"
        disabled={!valid}
        onClick={async () => {
          const ok = await run(
            (snap) =>
              saveRecurringRule(
                snap,
                { id: rule?.id, description, amount: a!, category_id: categoryId, payment_method: method, day_of_month: d, start_date: start, end_date: end || null, active },
                today,
              ).changes,
            { success: "נשמר" },
          );
          if (ok) onDone();
        }}
      >
        שמירה
      </Button>
      {rule ? (
        <Button variant="danger-ghost" className="w-full" onClick={() => onDelete(rule)}>
          <Trash2 /> מחיקת ההוראה
        </Button>
      ) : null}
    </div>
  );
}

function OccurrenceForm({ occ, onDone }: { occ: RecurringOccurrence; onDone: () => void }) {
  const { run } = useData();
  const [amount, setAmount] = useState(agorotToInput(occ.amount));
  const [date, setDate] = useState(occ.due_date);
  const a = parseShekelsToAgorot(amount);
  return (
    <div className="space-y-4">
      <AmountInput size="md" value={amount} onChange={setAmount} />
      <Field label="תאריך חיוב">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Button
        className="w-full"
        disabled={!a || !isValidISODate(date)}
        onClick={async () => {
          const ok = await run((snap) => editOccurrence(snap, occ.id, { amount: a!, due_date: date }), { success: "עודכן לחודש הזה" });
          if (ok) onDone();
        }}
      >
        שמירה
      </Button>
    </div>
  );
}
