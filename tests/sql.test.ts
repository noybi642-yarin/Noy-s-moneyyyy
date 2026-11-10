/**
 * Runs the real Supabase migration on an embedded Postgres (PGlite), with a minimal stub of
 * Supabase's `auth` schema, and replays domain change sets through `apply_changes` under RLS.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { applyChangeSet, baseSnapshot, SETTINGS } from "./helpers";
import {
  onboard,
  saveExpense,
  deleteExpense,
  saveRecurringRule,
  confirmOccurrence,
  savePlanned,
  convertPlannedToExpense,
  deleteCategory,
  deleteRecurringRule,
  updateSettings,
} from "@/lib/finance/mutations";
import { emptySnapshot, type ChangeSet, type Snapshot } from "@/lib/types";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
let db: PGlite;

async function asUser(uid: string, fn: () => Promise<unknown>) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}

async function apply(uid: string, cs: ChangeSet) {
  return asUser(uid, () => db.query("select public.apply_changes($1::jsonb)", [JSON.stringify(cs)]));
}

async function count(uid: string, table: string): Promise<number> {
  const r = (await asUser(uid, () => db.query(`select count(*)::int as n from public.${table}`))) as { rows: { n: number }[] };
  return r.rows[0].n;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    grant usage on schema public to authenticated, anon;
    insert into auth.users values ('${USER_A}'), ('${USER_B}');
  `);
  const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(path.join(dir, f), "utf8"));
});

describe("database migration + apply_changes", () => {
  it("replays a full set of domain operations with consistent results", async () => {
    let s: Snapshot = emptySnapshot();
    const step = async (cs: ChangeSet) => {
      await apply(USER_A, cs);
      s = applyChangeSet(s, cs);
    };
    await step(onboard(s, { budget: 800000, cutoffDay: 1, billingDay: 10, today: "2026-11-10" }));
    expect(await count(USER_A, "categories")).toBe(9);
    const catId = s.categories[0].id;
    const otherCat = s.categories[8].id;

    const e1 = saveExpense(s, s.settings!, {
      description: "סופר", amount: 100000, category_id: catId, purchase_date: "2026-11-05",
      payment_method: "credit_card", installments_count: 3,
    });
    await step(e1.changes);
    expect(await count(USER_A, "installments")).toBe(3);

    // edit: 3 → 1 payments
    await step(saveExpense(s, s.settings!, { ...e1.expense, installments_count: 1, amount: 5000 }).changes);
    expect(await count(USER_A, "installments")).toBe(1);

    const rule = saveRecurringRule(s, {
      description: "גן", amount: 250000, category_id: catId, payment_method: "bank_transfer",
      day_of_month: 5, start_date: "2026-10-01", end_date: null, active: true,
    }, "2026-11-10");
    await step(rule.changes);
    const occ = s.recurring_occurrences.find((o) => o.cycle_start === "2026-11-02")!;
    const conf = confirmOccurrence(s, s.settings!, occ.id);
    await step(conf.changes);
    // deleting the confirmed expense must reset the occurrence (CHECK + FK set null interplay)
    await step(deleteExpense(s, conf.expense.id));
    const r = await asUser(USER_A, () => db.query<{ status: string }>(`select status from recurring_occurrences where id = $1`, [occ.id])) as { rows: { status: string }[] };
    expect(r.rows[0].status).toBe("expected");
    await step(confirmOccurrence(s, s.settings!, occ.id).changes);

    const p = savePlanned(s, { description: "שרשרת", amount: 45000, category_id: otherCat, payment_method: "credit_card", installments_count: 3 });
    await step(p.changes);
    await step(convertPlannedToExpense(s, s.settings!, p.planned.id, {
      description: "שרשרת", amount: 45000, category_id: otherCat, purchase_date: "2026-11-10",
      payment_method: "credit_card", installments_count: 3,
    }).changes);

    // reassign + delete category
    await step(deleteCategory(s, otherCat, catId));
    await step(updateSettings(s, { card_billing_day: 12 }, "2026-11-10"));
    await step(deleteRecurringRule(s, rule.rule.id));

    for (const t of ["expenses", "installments", "categories", "recurring_rules", "recurring_occurrences", "planned_purchases", "budgets"] as const) {
      expect(await count(USER_A, t), t).toBe(s[t].length);
    }
    const sums = await asUser(USER_A, () => db.query<{ a: number; b: number }>(
      `select (select sum(amount) from expenses)::int as a, (select sum(amount) from installments)::int as b`)) as { rows: { a: number; b: number }[] };
    expect(sums.rows[0].a).toBe(sums.rows[0].b);
  });

  it("refuses double conversion of a planned purchase at the DB level", async () => {
    let s = applyChangeSet(baseSnapshot(), { upsert: {}, delete: {} });
    // seed categories for user B through apply_changes
    const seed: ChangeSet = { settings: SETTINGS, upsert: { categories: s.categories, budgets: s.budgets }, delete: {} };
    await apply(USER_B, seed);
    const p = savePlanned(s, { description: "x", amount: 1000, category_id: "fun", payment_method: "cash", installments_count: 1 });
    await apply(USER_B, p.changes);
    s = applyChangeSet(s, p.changes);
    const conv = convertPlannedToExpense(s, SETTINGS, p.planned.id, {
      description: "x", amount: 1000, category_id: "fun", purchase_date: "2026-11-10", payment_method: "cash", installments_count: 1,
    });
    await apply(USER_B, conv.changes);
    // A forged second expense pointing at the same planned purchase is rejected.
    const forged = saveExpense(s, SETTINGS, { description: "x", amount: 1000, category_id: "fun", purchase_date: "2026-11-10", payment_method: "cash", installments_count: 1 }, { planned_purchase_id: p.planned.id });
    await expect(apply(USER_B, forged.changes)).rejects.toThrow();
  });

  it("rejects installments that do not reconcile", async () => {
    const s = baseSnapshot();
    const e = saveExpense(s, SETTINGS, { description: "x", amount: 3000, category_id: "food", purchase_date: "2026-11-10", payment_method: "credit_card", installments_count: 3 });
    e.changes.upsert.installments![0] = { ...e.changes.upsert.installments![0], amount: 999 };
    await expect(apply(USER_B, e.changes)).rejects.toThrow(/reconcile/);
  });

  it("isolates users with RLS", async () => {
    expect(await count(USER_B, "expenses")).toBe(1);
    expect(await count(USER_A, "expenses")).toBeGreaterThan(0);
    const aRows = (await asUser(USER_A, () => db.query<{ id: string }>("select id from expenses"))) as { rows: { id: string }[] };
    const bRows = (await asUser(USER_B, () => db.query<{ id: string }>("select id from expenses"))) as { rows: { id: string }[] };
    expect(aRows.rows.some((r) => bRows.rows.some((b) => b.id === r.id))).toBe(false);
    // user B cannot delete or overwrite user A's rows
    const victim = aRows.rows[0].id;
    await apply(USER_B, { upsert: {}, delete: { expenses: [victim] } });
    expect((await asUser(USER_A, () => db.query("select 1 from expenses where id = $1", [victim])) as { rows: unknown[] }).rows).toHaveLength(1);
    await expect(
      apply(USER_B, { upsert: { budgets: [{ id: "budget:2026-11-02", effective_cycle: "2026-11-02", amount: 1, created_at: "2026-01-01T00:00:00Z" }] }, delete: {} }),
    ).rejects.toThrow();
    // anonymous calls are refused
    await db.exec(`set role anon;`);
    await expect(db.query("select public.apply_changes('{}'::jsonb)")).rejects.toThrow();
    await expect(db.query("select * from public.expenses")).rejects.toThrow();
    await db.exec(`reset role;`);
  });
});
