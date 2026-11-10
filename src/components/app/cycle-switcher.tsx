"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cycleLabel, cycleRangeLabel, shiftCycleKey } from "@/lib/cycle";
import { useData } from "./data-provider";
import { cn } from "@/lib/utils";

export function CycleSwitcher({ className }: { className?: string }) {
  const { viewCycle, setViewCycle, currentCycle } = useData();
  const isCurrent = viewCycle === currentCycle;
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded-2xl bg-card p-1.5 shadow-[var(--shadow-soft)] ring-1 ring-line/60", className)}>
      <button
        type="button"
        onClick={() => setViewCycle(shiftCycleKey(viewCycle, -1))}
        className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-cream-deep hover:text-ink active:scale-95"
        aria-label="מחזור קודם"
      >
        <ChevronRight className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => setViewCycle(currentCycle)}
        className="flex flex-col items-center leading-tight"
        aria-label="חזרה למחזור הנוכחי"
      >
        <span className="text-[15px] font-semibold text-ink">מחזור {cycleLabel(viewCycle)}</span>
        <span className="text-xs text-muted">
          <span className="num">{cycleRangeLabel(viewCycle)}</span>
          {isCurrent ? " · נוכחי" : viewCycle > currentCycle ? " · עתידי" : " · הסתיים"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setViewCycle(shiftCycleKey(viewCycle, 1))}
        className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-cream-deep hover:text-ink active:scale-95"
        aria-label="מחזור הבא"
      >
        <ChevronLeft className="size-5" />
      </button>
    </div>
  );
}
