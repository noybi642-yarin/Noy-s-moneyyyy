"use client";

import { useState } from "react";
import { CloudOff, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase";
import { BrandMark, BrandName } from "./brand";
import { AmountInput } from "./amount-input";
import { parseShekelsToAgorot } from "@/lib/money";
import { onboard as buildOnboarding } from "@/lib/finance/mutations";
import type { ChangeSet, Snapshot } from "@/lib/types";
import { todayInJerusalem } from "@/lib/dates";
import { installmentChargeDate } from "@/lib/card";
import { formatDayMonth } from "@/lib/dates";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">{children}</div>;
}

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex animate-fade flex-col items-center gap-4">
        <BrandMark className="size-16 rounded-[18px] shadow-[var(--shadow-lift)]" />
        <LoaderCircle className="size-5 animate-spin text-muted" />
      </div>
    </div>
  );
}

export function ErrorScreen({ error, retry }: { error: string | null; retry: () => void }) {
  return (
    <Centered>
      <div className="rounded-[28px] bg-card p-6 text-center shadow-[var(--shadow-soft)] ring-1 ring-line/60">
        <CloudOff className="mx-auto size-10 text-blush-ink" />
        <h1 className="mt-3 text-lg font-semibold">לא הצלחנו לטעון את הנתונים</h1>
        <p className="mt-1 text-sm text-muted">ייתכן שאין חיבור לאינטרנט. הנתונים שלך שמורים ולא נמחקו.</p>
        {error ? <p className="num mt-3 rounded-xl bg-cream-deep p-2 text-xs text-muted">{error}</p> : null}
        <Button className="mt-5 w-full" onClick={retry}>
          ניסיון נוסף
        </Button>
      </div>
    </Centered>
  );
}

export function LoginScreen() {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const sb = getSupabase();
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) toast.success("נשלח מייל לאימות הכתובת. אחרי האימות אפשר להתחבר.");
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("אם הכתובת רשומה, נשלח אליה קישור לאיפוס סיסמה");
        setMode("signin");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(/invalid login/i.test(msg) ? "אימייל או סיסמה שגויים" : `לא הצלחנו: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <div className="mb-10 flex animate-rise flex-col items-center gap-5 text-center">
        <BrandMark className="size-20 rounded-[22px] shadow-[var(--shadow-lift)]" />
        <BrandName tagline className="text-center" />
      </div>
      <form onSubmit={submit} className="animate-rise space-y-4 rounded-[28px] bg-card p-6 shadow-[var(--shadow-soft)] ring-1 ring-line/60">
        <h1 className="text-lg font-semibold">
          {mode === "signin" ? "כניסה" : mode === "signup" ? "יצירת חשבון פרטי" : "איפוס סיסמה"}
        </h1>
        <Field label="אימייל" htmlFor="email">
          <div className="relative">
            <Input id="email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="ps-11 text-left" />
            <Mail className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          </div>
        </Field>
        {mode !== "reset" ? (
          <Field label="סיסמה" htmlFor="password">
            <div className="relative">
              <Input
                id="password"
                type="password"
                dir="ltr"
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ps-11 text-left"
              />
              <KeyRound className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            </div>
          </Field>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : null}
          {mode === "signin" ? "כניסה" : mode === "signup" ? "יצירת חשבון" : "שליחת קישור"}
        </Button>
        <div className="flex justify-between text-sm">
          {mode === "signin" ? (
            <>
              <button type="button" className="text-forest underline-offset-4 hover:underline" onClick={() => setMode("signup")}>
                אין לי חשבון עדיין
              </button>
              <button type="button" className="text-muted underline-offset-4 hover:underline" onClick={() => setMode("reset")}>
                שכחתי סיסמה
              </button>
            </>
          ) : (
            <button type="button" className="text-forest underline-offset-4 hover:underline" onClick={() => setMode("signin")}>
              חזרה לכניסה
            </button>
          )}
        </div>
      </form>
      <p className="mt-6 text-center text-xs leading-relaxed text-muted">
        הנתונים הפיננסיים פרטיים ונגישים רק לחשבון שלך.
      </p>
    </Centered>
  );
}

export function Onboarding({ onDone, mode, snapshot }: { onDone: (cs: ChangeSet) => Promise<boolean>; mode: "cloud" | "local"; snapshot: Snapshot }) {
  const [budget, setBudget] = useState("");
  const [cutoff, setCutoff] = useState("1");
  const [billing, setBilling] = useState("10");
  const [busy, setBusy] = useState(false);
  const amount = parseShekelsToAgorot(budget);
  const cutoffN = parseInt(cutoff, 10);
  const billingN = parseInt(billing, 10);
  const daysOk = [cutoffN, billingN].every((n) => Number.isInteger(n) && n >= 1 && n <= 31);
  const today = todayInJerusalem();
  const example = daysOk ? installmentChargeDate(today, 0, { cutoffDay: cutoffN, billingDay: billingN }) : null;

  return (
    <Centered>
      <div className="mb-8 flex animate-rise items-center gap-3">
        <BrandMark />
        <BrandName tagline />
      </div>
      <div className="animate-rise space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">שנתחיל?</h1>
          <p className="mt-1 text-sm text-muted">שלושה פרטים קטנים וזה מוכן. הכול ניתן לשינוי בהגדרות.</p>
        </div>
        <Field label="תקציב חודשי" hint="המחזור מתחיל ב-2 לכל חודש ומסתיים ב-1 לחודש הבא.">
          <AmountInput value={budget} onChange={setBudget} autoFocus />
        </Field>
        <div className="rounded-3xl bg-card p-4 ring-1 ring-line/60">
          <p className="mb-3 text-sm font-medium">כרטיס האשראי</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="יום סגירת החשבון" htmlFor="cutoff">
              <Input id="cutoff" inputMode="numeric" value={cutoff} onChange={(e) => setCutoff(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="יום החיוב בבנק" htmlFor="billing">
              <Input id="billing" inputMode="numeric" value={billing} onChange={(e) => setBilling(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          {example ? (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              לדוגמה: רכישה באשראי היום תחויב בתאריך <b className="text-ink">{formatDayMonth(example)}</b>.
            </p>
          ) : (
            <p className="mt-3 text-xs text-danger">יום בחודש חייב להיות בין 1 ל-31</p>
          )}
        </div>
        {mode === "local" ? (
          <p className="rounded-2xl bg-amber-soft p-3 text-xs leading-relaxed text-amber">
            מצב מקומי: הנתונים יישמרו רק בדפדפן הזה ולא יגובו בענן. לחיבור לענן יש להגדיר Supabase (ראו README).
          </p>
        ) : null}
        <Button
          size="lg"
          className="w-full"
          disabled={busy || amount === null || amount <= 0 || !daysOk}
          onClick={async () => {
            setBusy(true);
            const ok = await onDone(
              buildOnboarding(snapshot, { budget: amount!, cutoffDay: cutoffN, billingDay: billingN, today }),
            );
            if (!ok) setBusy(false);
          }}
        >
          יאללה, מתחילים
        </Button>
      </div>
    </Centered>
  );
}
