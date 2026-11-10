"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useData } from "@/components/app/data-provider";
import { PageHeader } from "@/components/app/page-header";
import { Money } from "@/components/app/money";
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon } from "@/components/app/category-icon";
import { AmountInput } from "@/components/app/amount-input";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { categoryUsageCount, deleteCategory, reorderCategories, saveCategory } from "@/lib/finance/mutations";
import { agorotToInput, parseShekelsToAgorot } from "@/lib/money";
import { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function CategoriesPage() {
  const { categories, snapshot, run } = useData();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [target, setTarget] = useState("");

  const move = (idx: number, delta: number) => {
    const ids = categories.map((c) => c.id);
    const j = idx + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    void run((snap) => reorderCategories(snap, ids));
  };

  const usage = deleting ? categoryUsageCount(snapshot, deleting.id) : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="קטגוריות"
        subtitle="סדר, צבעים ותקציב לקטגוריה (רשות)"
        back="/more"
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> חדשה
          </Button>
        }
      />
      <Card className="divide-y divide-line/60 px-3">
        {categories.map((c, idx) => (
          <div key={c.id} className="flex items-center gap-3 py-3">
            <CategoryIcon icon={c.icon} color={c.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{c.name}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                {c.monthly_budget !== null ? (
                  <span>
                    תקציב <Money value={c.monthly_budget} />
                  </span>
                ) : (
                  <span>ללא תקציב נפרד</span>
                )}
                {c.is_discretionary ? <Badge variant="blush">פינוקים</Badge> : null}
              </p>
            </div>
            <div className="flex items-center">
              <Button size="icon-sm" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="הזזה למעלה">
                <ArrowUp />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === categories.length - 1} aria-label="הזזה למטה">
                <ArrowDown />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => setEditing(c)} aria-label="עריכה">
                <Pencil />
              </Button>
              <Button
                size="icon-sm"
                variant="danger-ghost"
                onClick={() => {
                  setTarget(categories.find((x) => x.id !== c.id)?.id ?? "");
                  setDeleting(c);
                }}
                aria-label="מחיקה"
                disabled={categories.length <= 1}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </Card>
      <p className="px-2 text-xs leading-relaxed text-muted">
        תקציב לקטגוריה הוא עזר למעקב בלבד — התקציב החודשי הכולל נשאר אחד. ״פינוקים״ מסמן הוצאות גמישות לצורך התובנות.
      </p>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "קטגוריה חדשה" : "עריכת קטגוריה"}>
          {editing !== null ? <CategoryForm category={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`למחוק את ״${deleting?.name ?? ""}״?`}
        description={usage > 0 ? `יש ${usage} רשומות בקטגוריה הזו. כדי לא לאבד אותן, הן יועברו לקטגוריה אחרת.` : "אין רשומות בקטגוריה הזו."}
        confirmLabel={usage > 0 ? "העברה ומחיקה" : "מחיקה"}
        danger
        onConfirm={() => run((snap) => deleteCategory(snap, deleting!.id, usage > 0 ? target : null), { success: "הקטגוריה נמחקה" })}
      >
        {usage > 0 ? (
          <Field label="להעביר את הרשומות אל">
            <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)}>
              {categories
                .filter((c) => c.id !== deleting?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const { run } = useData();
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "circle-ellipsis");
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]);
  const [budget, setBudget] = useState(category?.monthly_budget != null ? agorotToInput(category.monthly_budget) : "");
  const [discretionary, setDiscretionary] = useState(category?.is_discretionary ?? false);
  const budgetAgorot = budget.trim() ? parseShekelsToAgorot(budget) : null;
  const budgetInvalid = budget.trim() !== "" && budgetAgorot === null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={icon} color={color} size="lg" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הקטגוריה" autoFocus={!category} maxLength={60} />
      </div>
      <Field label="אייקון">
        <div className="grid grid-cols-7 gap-1.5">
          {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setIcon(key)}
              className={cn("grid aspect-square place-items-center rounded-xl transition", icon === key ? "bg-forest text-forest-ink" : "bg-card text-muted ring-1 ring-line/60")}
              aria-label={key}
              aria-pressed={icon === key}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </Field>
      <Field label="צבע">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn("size-8 rounded-full transition", color === c && "ring-2 ring-forest ring-offset-2 ring-offset-cream")}
              style={{ backgroundColor: c }}
              aria-label={c}
              aria-pressed={color === c}
            />
          ))}
        </div>
      </Field>
      <Field label="תקציב חודשי לקטגוריה (רשות)" hint={budgetInvalid ? "סכום לא תקין" : "ריק = ללא תקציב נפרד"}>
        <AmountInput size="md" value={budget} onChange={setBudget} />
      </Field>
      <label className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 ring-1 ring-line/60">
        <span className="text-sm">הוצאה גמישה / פינוקים</span>
        <Switch checked={discretionary} onCheckedChange={setDiscretionary} />
      </label>
      <Button
        className="w-full"
        disabled={!name.trim() || budgetInvalid}
        onClick={async () => {
          const ok = await run(
            (snap) => saveCategory(snap, { id: category?.id, name, icon, color, monthly_budget: budgetAgorot, is_discretionary: discretionary }),
            { success: "נשמר" },
          );
          if (ok) onDone();
        }}
      >
        שמירה
      </Button>
    </div>
  );
}
