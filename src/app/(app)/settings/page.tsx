"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, KeyRound, LogOut, Repeat, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/app/data-provider";
import { PageHeader } from "@/components/app/page-header";
import { BudgetForm } from "@/components/app/budget-edit";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { updateSettings } from "@/lib/finance/mutations";
import { installmentChargeDate, validateCardConfig } from "@/lib/card";
import { cycleLabel } from "@/lib/cycle";
import { formatDayMonth } from "@/lib/dates";
import { downloadText, expensesToCsv } from "@/lib/csv";
import { getSupabase } from "@/lib/supabase";
import { LocalStore } from "@/lib/store/local";
import { AccountingPolicy, Settings } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { settings, snapshot, currentCycle, today, run, mode, userEmail, signOut } = useData();
  const [cutoff, setCutoff] = useState(String(settings.card_cutoff_day));
  const [billing, setBilling] = useState(String(settings.card_billing_day));
  const [password, setPassword] = useState("");
  const [wipe, setWipe] = useState(false);
  const cfg = { cutoffDay: parseInt(cutoff, 10), billingDay: parseInt(billing, 10) };
  const cfgError = validateCardConfig(cfg);
  const cardDirty = cfg.cutoffDay !== settings.card_cutoff_day || cfg.billingDay !== settings.card_billing_day;

  const patch = (p: Partial<Settings>, success?: string) => run((snap) => updateSettings(snap, p, today), { success });

  return (
    <div className="space-y-4">
      <PageHeader title="הגדרות" back="/more" />

      <Card>
        <CardHeader>
          <CardTitle>תקציב חודשי</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted">השינוי חל ממחזור {cycleLabel(currentCycle)} והלאה. מחזורים קודמים שומרים על התקציב ההיסטורי.</p>
          <BudgetForm cycle={currentCycle} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>שיטת חישוב התקציב</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(
            [
              ["cash_flow", "תזרים חודשי (ברירת מחדל)", "כל תשלום נספר במחזור שבו הוא משולם. עסקה ב-12 תשלומים מורידה מהתקציב תשלום אחד בכל חודש."],
              ["commitment", "התחייבות ברכישה", "כל סכום הרכישה נספר במחזור שבו קנית. התשלומים העתידיים עדיין מוצגים בנפרד בתחזית האשראי."],
            ] as [AccountingPolicy, string, string][]
          ).map(([value, title, desc]) => (
            <button
              key={value}
              type="button"
              onClick={() => settings.accounting_policy !== value && patch({ accounting_policy: value }, "שיטת החישוב עודכנה")}
              className={cn(
                "w-full rounded-2xl p-4 text-start ring-1 transition",
                settings.accounting_policy === value ? "bg-sage-soft ring-forest/40" : "bg-card ring-line/60 hover:bg-cream-deep",
              )}
              aria-pressed={settings.accounting_policy === value}
            >
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{desc}</p>
            </button>
          ))}
          <p className="text-[11px] text-muted">החלפת שיטה משנה רק את אופן החישוב — שום רשומה לא נמחקת או משוכפלת.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>כרטיס אשראי</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="יום סגירת החשבון" hint="רכישה עד היום הזה (כולל) נכנסת לחשבון של החודש">
              <Input inputMode="numeric" value={cutoff} onChange={(e) => setCutoff(e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </Field>
            <Field label="יום החיוב בבנק" hint="היום שבו החשבון יורד מהעו״ש">
              <Input inputMode="numeric" value={billing} onChange={(e) => setBilling(e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </Field>
          </div>
          {cfgError ? (
            <p className="text-xs text-danger">{cfgError}</p>
          ) : (
            <p className="text-xs text-muted">
              לדוגמה: רכישה היום תחויב ב-<b className="text-ink">{formatDayMonth(installmentChargeDate(today, 0, cfg))}</b>.
              {cfg.billingDay <= cfg.cutoffDay ? " (החיוב בחודש שאחרי הסגירה)" : ""}
            </p>
          )}
          <Button
            className="w-full"
            variant="secondary"
            disabled={!cardDirty || Boolean(cfgError)}
            onClick={() => patch({ card_cutoff_day: cfg.cutoffDay, card_billing_day: cfg.billingDay }, "עודכן. מועדי החיוב של תשלומים שטרם חויבו חושבו מחדש.")}
          >
            שמירת הגדרות כרטיס
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>התראות</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {(
            [
              ["notify_70", "70% מהתקציב"],
              ["notify_90", "90% מהתקציב"],
              ["notify_100", "100% מהתקציב"],
              ["notify_pace", "קצב הוצאות מהיר מהצפוי"],
            ] as [keyof Settings, string][]
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between py-2">
              <span className="text-sm">{label}</span>
              <Switch checked={Boolean(settings[key])} onCheckedChange={(v) => patch({ [key]: v } as Partial<Settings>)} />
            </label>
          ))}
          <p className="pt-1 text-[11px] leading-relaxed text-muted">
            ההתראות מוצגות בתוך האפליקציה (במסך הבית ואחרי רישום הוצאה). אין כרגע התראות דחיפה ברקע.
          </p>
        </CardContent>
      </Card>

      <Card className="divide-y divide-line/60 px-2">
        <Link href="/categories" className="flex items-center gap-3 px-2 py-3.5 text-sm">
          <Tags className="size-5 text-forest" /> <span className="flex-1">קטגוריות</span> <ChevronLeft className="size-4 text-muted" />
        </Link>
        <Link href="/recurring" className="flex items-center gap-3 px-2 py-3.5 text-sm">
          <Repeat className="size-5 text-forest" /> <span className="flex-1">הוצאות קבועות</span> <ChevronLeft className="size-4 text-muted" />
        </Link>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-2 py-3.5 text-start text-sm"
          onClick={() => {
            if (snapshot.expenses.length === 0) return toast.info("אין עדיין הוצאות לייצוא");
            downloadText(`noys-moneyyyyyy-${today}.csv`, expensesToCsv(snapshot));
          }}
        >
          <Download className="size-5 text-forest" /> <span className="flex-1">ייצוא הוצאות ל-CSV</span>
          <span className="text-xs text-muted">{snapshot.expenses.length} רשומות</span>
        </button>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>חשבון</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mode === "cloud" ? (
            <>
              <p className="text-sm text-muted">
                מחובר כ-<span className="num text-ink">{userEmail}</span> · הנתונים מגובים בענן ומוגנים כך שרק החשבון שלך רואה אותם.
              </p>
              <Field label="סיסמה חדשה">
                <div className="flex gap-2">
                  <Input type="password" dir="ltr" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <Button
                    variant="secondary"
                    disabled={password.length < 8}
                    onClick={async () => {
                      const { error } = await getSupabase().auth.updateUser({ password });
                      if (error) toast.error(`לא עודכן: ${error.message}`);
                      else {
                        toast.success("הסיסמה עודכנה");
                        setPassword("");
                      }
                    }}
                  >
                    <KeyRound /> עדכון
                  </Button>
                </div>
              </Field>
              <Button variant="outline" className="w-full" onClick={signOut}>
                <LogOut /> יציאה
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-muted">
                מצב מקומי: הנתונים שמורים רק בדפדפן הזה, ללא גיבוי וללא סנכרון. כדי לגבות בענן יש להגדיר Supabase (הוראות ב-README) — ומומלץ לייצא CSV מדי פעם.
              </p>
              <Button variant="danger-ghost" className="w-full" onClick={() => setWipe(true)}>
                <Trash2 /> מחיקת כל הנתונים המקומיים
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ההנחות שהחישובים מבוססים עליהן</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 ps-5 text-xs leading-relaxed text-muted">
            <li>מחזור תקציב מתחיל בתחילת ה-2 לחודש ונגמר רגע לפני ה-2 בחודש הבא. כל התאריכים לפי שעון ישראל.</li>
            <li>בשיטת התזרים, תשלום מספר N של עסקה נזקף למחזור ה-N אחרי מחזור הרכישה.</li>
            <li>בעסקה בתשלומים, אגורות עודפות מעיגול נוספות לתשלום הראשון, כך שהסכום תמיד מתאזן.</li>
            <li>תחזית האשראי כוללת רק עסקאות אשראי, כל תשלום פעם אחת בתאריך החיוב שלו.</li>
            <li>הוצאות קבועות צפויות ורכישות מתוכננות לא נספרות בניצול התקציב עד שהן מאושרות או נקנות.</li>
          </ul>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={wipe}
        onOpenChange={setWipe}
        title="למחוק את כל הנתונים המקומיים?"
        description="הפעולה לא ניתנת לביטול. כדאי לייצא CSV קודם."
        confirmLabel="מחיקה"
        danger
        onConfirm={() => {
          LocalStore.clear();
          window.location.assign(window.location.origin);
        }}
      />
    </div>
  );
}
