"use client";

import { useData } from "./data-provider";
import { CategoryIcon } from "./category-icon";
import { Money } from "./money";
import { SERIES } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

export interface CategoryBarDatum {
  categoryId: string;
  spent: number;
  budget?: number | null;
}

/** Labelled horizontal bars: identity is carried by the icon + name, magnitude by one hue. */
export function CategoryBars({ data, emptyText = "אין הוצאות במחזור הזה עדיין" }: { data: CategoryBarDatum[]; emptyText?: string }) {
  const { categoryById } = useData();
  const rows = data.filter((d) => d.spent > 0 || (d.budget ?? 0) > 0).sort((a, b) => b.spent - a.spent);
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>;
  const max = Math.max(...rows.map((r) => Math.max(r.spent, r.budget ?? 0)), 1);
  const total = rows.reduce((s, r) => s + r.spent, 0);
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => {
        const cat = categoryById.get(r.categoryId);
        const over = r.budget != null && r.spent > r.budget;
        const share = total > 0 ? Math.round((r.spent / total) * 100) : 0;
        return (
          <li key={r.categoryId} className="group" title={`${cat?.name ?? ""}: ${share}%`}>
            <div className="mb-1.5 flex items-center gap-2.5">
              <CategoryIcon icon={cat?.icon} color={cat?.color} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{cat?.name ?? "אחר"}</span>
              <span className="text-xs text-muted num">{share}%</span>
              <Money value={r.spent} className="text-sm font-semibold" />
            </div>
            <div className="relative h-2 rounded-full bg-cream-deep">
              <div
                className={cn("h-full rounded-full transition-[width] duration-700")}
                style={{ width: `${(r.spent / max) * 100}%`, backgroundColor: over ? "var(--danger)" : SERIES[0] }}
              />
              {r.budget != null ? (
                <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink/50" style={{ insetInlineStart: `${Math.min(100, (r.budget / max) * 100)}%` }} />
              ) : null}
            </div>
            {r.budget != null ? (
              <p className={cn("mt-1 text-[11px]", over ? "text-danger" : "text-muted")}>
                {over ? (
                  <>חריגה של <Money value={r.spent - r.budget} /> מתקציב הקטגוריה</>
                ) : (
                  <>נותרו <Money value={r.budget - r.spent} /> מתוך <Money value={r.budget} /></>
                )}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
