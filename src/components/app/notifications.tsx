"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, Gauge, Repeat, X } from "lucide-react";
import { useData } from "./data-provider";
import { alertLevel, summarizeCycle } from "@/lib/finance/budget";
import { overdueOccurrences } from "@/lib/finance/recurring";
import { formatILS } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Note {
  id: string;
  tone: "info" | "warn" | "danger";
  icon: typeof BellRing;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}

const DISMISS_KEY = "noys:dismissed-notes";

function readDismissed(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** In-app budget notifications (70% / 90% / 100%, spending pace, unconfirmed fixed payments). */
export function BudgetNotifications({ className }: { className?: string }) {
  const { snapshot, settings, today, currentCycle, allocations } = useData();
  // Only rendered client-side after data has loaded, so localStorage is available.
  const [dismissed, setDismissed] = useState<string[]>(() => (typeof window === "undefined" ? [] : readDismissed()));

  const notes = useMemo(() => {
    const out: Note[] = [];
    const s = summarizeCycle(snapshot, settings.accounting_policy, currentCycle, today, allocations);
    const level = alertLevel(s.usagePct);
    if (s.budget !== null) {
      if (level === 100 && settings.notify_100) {
        out.push({
          id: `${currentCycle}:100`,
          tone: "danger",
          icon: BellRing,
          title: "התקציב של המחזור נוצל במלואו",
          body:
            s.remaining !== null && s.remaining < 0
              ? `חריגה של ${formatILS(-s.remaining)}. זה קורה — אפשר לראות בתובנות איפה הכסף הלך.`
              : "כל הוצאה נוספת במחזור הזה תהיה מעבר לתקציב.",
          href: "/insights",
          cta: "לתובנות",
        });
      } else if (level === 90 && settings.notify_90) {
        out.push({
          id: `${currentCycle}:90`,
          tone: "warn",
          icon: BellRing,
          title: `נוצלו ${Math.floor(s.usagePct!)}% מהתקציב`,
          body: `נותרו ${formatILS(s.remaining!)} ל-${s.progress.remainingDays} הימים הבאים.`,
        });
      } else if (level === 70 && settings.notify_70) {
        out.push({
          id: `${currentCycle}:70`,
          tone: "info",
          icon: BellRing,
          title: `נוצלו ${Math.floor(s.usagePct!)}% מהתקציב`,
          body: `נותרו ${formatILS(s.remaining!)} ו-${s.progress.remainingDays} ימים במחזור.`,
        });
      }
      if (settings.notify_pace && s.paceAhead && level < 100) {
        out.push({
          id: `${currentCycle}:pace:${today}`,
          tone: "warn",
          icon: Gauge,
          title: "קצב ההוצאות מהיר מהרגיל",
          body: `לפי קצב אחיד היו צפויות כ-${formatILS(Math.round((s.expectedPaceConsumed ?? 0) / 100) * 100)} הוצאות משתנות עד היום.${
            s.expectedRecurringTotal > 0 ? ` בנוסף שמורים ${formatILS(s.expectedRecurringTotal)} לתשלומים קבועים.` : ""
          }`,
        });
      }
    }
    const overdue = overdueOccurrences(snapshot, today);
    if (overdue.length > 0) {
      out.push({
        id: `overdue:${overdue.map((o) => o.id).join(",")}`,
        tone: "info",
        icon: Repeat,
        title: overdue.length === 1 ? "תשלום קבוע ממתין לאישור" : `${overdue.length} תשלומים קבועים ממתינים לאישור`,
        body: "מועד החיוב עבר. אישור יעביר אותם ליומן ההוצאות.",
        href: "/recurring",
        cta: "לאישור",
      });
    }
    return out.filter((n) => !dismissed.includes(n.id));
  }, [snapshot, settings, today, currentCycle, allocations, dismissed]);

  if (notes.length === 0) return null;
  const dismiss = (id: string) => {
    const next = [...readDismissed(), id].slice(-60);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {}
    setDismissed(next);
  };

  return (
    <div className={cn("mb-4 space-y-2", className)} aria-live="polite">
      {notes.map((n) => {
        const Icon = n.icon;
        return (
          <div
            key={n.id}
            className={cn(
              "flex animate-rise items-start gap-3 rounded-3xl p-4 ring-1",
              n.tone === "danger" && "bg-danger-soft text-danger ring-danger/15",
              n.tone === "warn" && "bg-amber-soft text-[#8a5d17] ring-amber/20",
              n.tone === "info" && "bg-sage-soft text-forest ring-sage/40",
            )}
          >
            <Icon className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">{n.body}</p>
              {n.href ? (
                <Link href={n.href} className="mt-1.5 inline-block text-[13px] font-semibold underline underline-offset-4">
                  {n.cta}
                </Link>
              ) : null}
            </div>
            <button type="button" onClick={() => dismiss(n.id)} aria-label="הסתרה" className="rounded-full p-1 opacity-60 transition hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
