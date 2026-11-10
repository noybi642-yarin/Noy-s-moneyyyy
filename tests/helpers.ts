import { emptySnapshot, Settings, Snapshot, applyChangeSet, Category } from "@/lib/types";

export const SETTINGS: Settings = {
  accounting_policy: "cash_flow",
  card_cutoff_day: 1,
  card_billing_day: 10,
  notify_70: true,
  notify_90: true,
  notify_100: true,
  notify_pace: true,
  onboarded: true,
  updated_at: "2026-01-01T00:00:00Z",
};

export function cat(id: string, extra: Partial<Category> = {}): Category {
  return {
    id,
    name: id,
    icon: "circle",
    color: "#000",
    sort_order: 0,
    monthly_budget: null,
    is_discretionary: false,
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

export function baseSnapshot(settings: Settings = SETTINGS): Snapshot {
  return {
    ...emptySnapshot(),
    settings,
    categories: [cat("food"), cat("fun", { is_discretionary: true }), cat("other")],
    budgets: [{ id: "budget:2026-01-02", effective_cycle: "2026-01-02", amount: 1_000_000, created_at: "2026-01-01T00:00:00Z" }],
  };
}

export { applyChangeSet };
