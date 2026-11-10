# Noy's moneyyyyyy

*My money. My rules.*

A private, mobile-first personal budgeting app (Hebrew, RTL, ₪). Record expenses in seconds and always know:
how much was spent, what's left, what the next credit-card charge will be, which fixed payments are coming,
how much is committed to future installments, and what happens if you buy something else.

## Features

| Area | What it does |
| --- | --- |
| **Dashboard** | Remaining budget, usage % with even-pace marker, days left in cycle, "free after fixed payments", next card charge, expected recurring, installment commitments, planned purchases, spending by category (with optional category budgets), recent expenses, in-app 70% / 90% / 100% / pace / overdue-recurring notices. |
| **Budget cycle** | Starts on the **2nd** of each month: `[2nd 00:00, next 2nd 00:00)` in **Asia/Jerusalem**. Navigate past, current and future cycles. Budget changes apply from a cycle onward; history is kept. |
| **New expense** | Amount (autofocus, decimal keypad) → description (merchant memory auto-picks the category) → category tap → save. Card / transfer / cash, 1–36 installments with live schedule preview, date chips, optional notes. |
| **Credit-card forecast** | Configurable statement cutoff day and billing day. Each payment lands on its own statement. Next charge, the next 6 statements (chart), future commitments, already-charged amounts, active installment plans. Cash & transfers never appear. |
| **Accounting policy** | *Cash-flow* (default): payment N of a purchase counts in the Nth cycle after purchase. *Commitment*: whole purchase counts in its purchase cycle. Switching only changes the view — data is never rewritten. |
| **Recurring** | Rules (amount, category, method, day of month, start/end, active). Occurrences generated per cycle with deterministic ids (no duplicates). Expected vs confirmed vs skipped; edit one occurrence or the rule (rule edits update only future, unconfirmed, non-overridden occurrences). |
| **מה אם אקנה?** | Multi-item simulation using the real budget and card engines: remaining before/after, usage %, category effect, effect on each card statement, current vs later cycles. Not saved → save as planned → mark purchased (converted to one real expense, linked, counted once). |
| **Journal** | Grouped by date; per-cycle; search; category / payment-method / type filters; recurring, expected and planned items are visually distinct; installments from earlier purchases that hit this cycle; calendar heat view; details with full payment schedule; edit & delete. |
| **Insights** | Monthly comparison vs budget, cumulative spending pace vs last cycle, by-category with change vs last cycle, payment-method split, recurring vs variable, discretionary share, largest expenses, overages (12 cycles), planned→purchased. Short Hebrew insights only when there is enough data (e.g. same-point-in-cycle comparisons). |
| **Settings** | Budget + history, policy, card config (with a live example), notification toggles, categories (add/edit/reorder/delete with safe reassignment), recurring, CSV export (Excel-friendly Hebrew), password change, sign out. Financial assumptions listed explicitly. |
| **PWA** | Manifest, maskable icons, shortcuts, minimal service worker (app shell only, never caches financial API calls). Installable on Android ("Add to Home screen"). |

### Money & integrity

* All money is **integer agorot** end to end (DB `integer`, TS numbers that are always safe integers). User input is parsed with string arithmetic.
* Installments: remainder agorot go to the first payment, so payments always sum exactly to the purchase. A deferred DB constraint trigger rejects any transaction where they don't reconcile.
* Every operation (e.g. "convert planned purchase") is a pure function producing a **change set** that is applied atomically — one Postgres transaction via the `apply_changes` RPC.
* Unique indexes guarantee a recurring occurrence or a planned purchase can become **at most one** expense.
* Deleting an expense returns its recurring occurrence to *expected* / its planned purchase to *planned*.
* Changing card days recalculates only not-yet-charged payment dates.

### Security

* Supabase Auth (email + password, password reset). Row-level security on every table: `user_id = auth.uid()` for all operations; `anon` has no table access.
* `apply_changes` is `SECURITY INVOKER` (RLS applies) and forces `user_id = auth.uid()`; composite foreign keys `(user_id, id)` prevent cross-user references.
* The browser uses only the public URL + anon/publishable key. **No service-role key is used anywhere.**

## Run locally

Requirements: Node 20+ (tested on 22).

```bash
npm install
cp .env.example .env.local     # optional — leave empty for local mode
npm run dev                    # http://localhost:3000
```

Without Supabase variables the app runs in **local mode**: data is stored only in that browser's `localStorage`,
with a permanent banner saying it is not backed up. Use it for trying the app, not as your only copy (CSV export is in Settings).

Other scripts:

```bash
npm test          # unit + database tests (vitest; DB tests run the real migration on embedded Postgres via PGlite)
npm run typecheck
npm run lint
npm run build && npm start
```

## Environment variables

| Name | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | for cloud mode | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for cloud mode | anon key, or the newer publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is also accepted) |

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migration — either:
   * **SQL editor:** paste `supabase/migrations/20261110000000_init.sql` and run it, or
   * **CLI:** `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Authentication → URL configuration:** set *Site URL* to your app URL and add `https://<your-domain>/reset-password`
   (and `http://localhost:3000/**` for development) to *Redirect URLs*.
4. Copy the project URL and anon/publishable key into `.env.local`.
5. Open the app, choose "אין לי חשבון עדיין", create your account (confirm the email if confirmations are on).
6. **Recommended for a single-user app:** after creating your account, disable new sign-ups
   (Authentication → Sign In / Providers → *Allow new users to sign up* = off).

## Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel (framework preset: Next.js; defaults are fine).
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under *Project → Settings → Environment Variables* (Production + Preview).
3. Deploy. Then add the production URL (and `/reset-password`) to Supabase *Redirect URLs* and set it as the *Site URL*.
4. On Android: open the site in Chrome → menu → *Install app / Add to Home screen*.

## Project layout

```
src/lib/                 pure domain logic (no React)
  money.ts dates.ts cycle.ts card.ts types.ts
  finance/               schedule, budget, forecast, recurring, mutations, simulate, insights
  store/                 Supabase + local-mode adapters (same atomic ChangeSet interface)
src/components/app/      app components (data provider, forms, dialogs, charts)
src/components/ui/       shadcn/ui-style primitives (Radix + Tailwind)
src/app/                 routes: / journal new insights more what-if card recurring categories settings reset-password
supabase/migrations/     schema, RLS, constraints, apply_changes RPC
tests/                   vitest suites
```

## Known limitations

* No background push notifications — alerts are in-app only (shown on the dashboard and after saving an expense).
* Offline: the app shell loads offline, but cloud data needs a connection; writes made offline fail with a clear message (no offline queue).
* Category budgets are a single current value (not historical like the overall budget).
* The interface is light-mode only.
* shadcn/ui components were written by hand in the shadcn style (the shadcn registry was unreachable from the build environment); they use the same Radix + Tailwind + CVA approach.
