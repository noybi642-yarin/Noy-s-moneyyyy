"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AmountInput } from "./amount-input";
import { useData } from "./data-provider";
import { Money } from "./money";
import { budgetForCycle } from "@/lib/finance/budget";
import { setBudget } from "@/lib/finance/mutations";
import { agorotToInput, parseShekelsToAgorot } from "@/lib/money";
import { cycleLabel, CycleKey } from "@/lib/cycle";

export function BudgetEditDialog({ open, onOpenChange, cycle }: { open: boolean; onOpenChange: (o: boolean) => void; cycle: CycleKey }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="תקציב חודשי" description={`החל ממחזור ${cycleLabel(cycle)}. מחזורים קודמים שומרים על התקציב שהיה בהם.`}>
        {open ? <BudgetForm cycle={cycle} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function BudgetForm({ cycle, onDone }: { cycle: CycleKey; onDone?: () => void }) {
  const { snapshot, run } = useData();
  const current = budgetForCycle(snapshot.budgets, cycle);
  const [value, setValue] = useState(current !== null ? agorotToInput(current) : "");
  const amount = parseShekelsToAgorot(value);
  const history = [...snapshot.budgets].sort((a, b) => (a.effective_cycle < b.effective_cycle ? 1 : -1));
  return (
    <div className="space-y-4">
      <AmountInput value={value} onChange={setValue} autoFocus />
      <Button
        className="w-full"
        disabled={amount === null || amount === current}
        onClick={async () => {
          const ok = await run((snap) => setBudget(snap, cycle, amount!), { success: "התקציב עודכן" });
          if (ok) onDone?.();
        }}
      >
        שמירה
      </Button>
      {history.length > 0 ? (
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">היסטוריית תקציב</p>
          <ul className="divide-y divide-line/60 rounded-2xl bg-card px-4 ring-1 ring-line/60">
            {history.map((b) => (
              <li key={b.id} className="flex justify-between py-2.5 text-sm">
                <span>מ{cycleLabel(b.effective_cycle)}</span>
                <Money value={b.amount} className="font-medium" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
