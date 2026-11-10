-- Noy's moneyyyyyy — initial schema
-- All money columns are INTEGER AGOROT (1 ₪ = 100). All dates are calendar dates in Asia/Jerusalem.
-- Every table is user-scoped and protected by row-level security.

-- ───────────────────────────────────────────────────────────── settings
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  accounting_policy text not null default 'cash_flow' check (accounting_policy in ('cash_flow', 'commitment')),
  card_cutoff_day smallint not null default 1 check (card_cutoff_day between 1 and 31),
  card_billing_day smallint not null default 10 check (card_billing_day between 1 and 31),
  notify_70 boolean not null default true,
  notify_90 boolean not null default true,
  notify_100 boolean not null default true,
  notify_pace boolean not null default true,
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────── budgets (history)
-- A budget amount is effective from `effective_cycle` (cycle start date, the 2nd) until a later record.
create table if not exists public.budgets (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_cycle date not null check (extract(day from effective_cycle) = 2),
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, effective_cycle)
);

-- ───────────────────────────────────────────────────────────── categories
create table if not exists public.categories (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  icon text not null default 'circle',
  color text not null default '#7C9A7E',
  sort_order integer not null default 0,
  monthly_budget integer check (monthly_budget is null or monthly_budget >= 0),
  is_discretionary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

-- ───────────────────────────────────────────────────────────── recurring rules
create table if not exists public.recurring_rules (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  description text not null,
  amount integer not null check (amount > 0),
  category_id text not null,
  payment_method text not null check (payment_method in ('credit_card', 'bank_transfer', 'cash')),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, category_id) references public.categories (user_id, id) deferrable initially deferred
);

-- ───────────────────────────────────────────────────────────── planned purchases
create table if not exists public.planned_purchases (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  description text not null,
  amount integer not null check (amount > 0),
  category_id text not null,
  payment_method text not null check (payment_method in ('credit_card', 'bank_transfer', 'cash')),
  installments_count smallint not null default 1 check (installments_count between 1 and 36),
  notes text,
  status text not null default 'planned' check (status in ('planned', 'purchased')),
  expense_id text,
  purchased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (installments_count = 1 or payment_method = 'credit_card'),
  check (status = 'purchased' or expense_id is null),
  foreign key (user_id, category_id) references public.categories (user_id, id) deferrable initially deferred
);

-- ───────────────────────────────────────────────────────────── recurring occurrences
-- Deterministic id `occ:<rule>:<cycle>` + unique(rule, cycle) → generation can never duplicate.
create table if not exists public.recurring_occurrences (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rule_id text not null,
  cycle_start date not null check (extract(day from cycle_start) = 2),
  due_date date not null,
  amount integer not null check (amount > 0),
  status text not null default 'expected' check (status in ('expected', 'confirmed', 'skipped')),
  expense_id text,
  is_overridden boolean not null default false,
  unique (user_id, id),
  unique (user_id, rule_id, cycle_start),
  -- only a confirmed occurrence may point at an expense
  check (status = 'confirmed' or expense_id is null),
  foreign key (user_id, rule_id) references public.recurring_rules (user_id, id) on delete cascade deferrable initially deferred
);

-- ───────────────────────────────────────────────────────────── expenses
create table if not exists public.expenses (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  amount integer not null check (amount > 0),
  category_id text not null,
  purchase_date date not null,
  payment_method text not null check (payment_method in ('credit_card', 'bank_transfer', 'cash')),
  installments_count smallint not null default 1 check (installments_count between 1 and 36),
  notes text,
  source text not null default 'manual' check (source in ('manual', 'recurring', 'planned')),
  recurring_occurrence_id text,
  planned_purchase_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (installments_count = 1 or payment_method = 'credit_card'),
  foreign key (user_id, category_id) references public.categories (user_id, id) deferrable initially deferred,
  foreign key (user_id, recurring_occurrence_id) references public.recurring_occurrences (user_id, id)
    on delete set null (recurring_occurrence_id) deferrable initially deferred,
  foreign key (user_id, planned_purchase_id) references public.planned_purchases (user_id, id)
    on delete set null (planned_purchase_id) deferrable initially deferred
);

-- A recurring occurrence / planned purchase can be converted into at most ONE expense.
create unique index if not exists expenses_one_per_occurrence on public.expenses (recurring_occurrence_id)
  where recurring_occurrence_id is not null;
create unique index if not exists expenses_one_per_planned on public.expenses (planned_purchase_id)
  where planned_purchase_id is not null;
create index if not exists expenses_user_date on public.expenses (user_id, purchase_date);

alter table public.recurring_occurrences
  add constraint recurring_occurrences_expense_fk foreign key (user_id, expense_id)
  references public.expenses (user_id, id) on delete set null (expense_id) deferrable initially deferred;
alter table public.planned_purchases
  add constraint planned_purchases_expense_fk foreign key (user_id, expense_id)
  references public.expenses (user_id, id) on delete set null (expense_id) deferrable initially deferred;

-- ───────────────────────────────────────────────────────────── installments (payments of an expense)
create table if not exists public.installments (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expense_id text not null,
  number smallint not null check (number between 1 and 36),
  amount integer not null,
  charge_date date,
  unique (expense_id, number),
  foreign key (user_id, expense_id) references public.expenses (user_id, id) on delete cascade deferrable initially deferred
);
create index if not exists installments_user_charge on public.installments (user_id, charge_date);

-- Installment amounts must reconcile exactly to the expense amount (checked at commit).
create or replace function public.check_installments_reconcile() returns trigger
language plpgsql set search_path = public as $$
declare
  eid text;
  total integer;
  cnt integer;
  exp record;
begin
  if tg_table_name = 'expenses' then
    eid := new.id;
  elsif tg_op = 'DELETE' then
    eid := old.expense_id;
  else
    eid := new.expense_id;
  end if;
  select * into exp from public.expenses where id = eid;
  if not found then return null; end if;
  select coalesce(sum(amount), 0), count(*) into total, cnt from public.installments where expense_id = eid;
  if total <> exp.amount or cnt <> exp.installments_count then
    raise exception 'installments of expense % do not reconcile (sum %, count %; expected %, %)',
      eid, total, cnt, exp.amount, exp.installments_count;
  end if;
  return null;
end $$;

drop trigger if exists installments_reconcile on public.installments;
create constraint trigger installments_reconcile after insert or update or delete on public.installments
  deferrable initially deferred for each row execute function public.check_installments_reconcile();
drop trigger if exists expenses_reconcile on public.expenses;
create constraint trigger expenses_reconcile after insert or update on public.expenses
  deferrable initially deferred for each row execute function public.check_installments_reconcile();

-- ───────────────────────────────────────────────────────────── row-level security
do $$
declare t text;
begin
  foreach t in array array['settings','budgets','categories','recurring_rules','planned_purchases',
                           'recurring_occurrences','expenses','installments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────── atomic change sets
-- The app sends every logical operation (e.g. "convert planned purchase") as one change set.
-- SECURITY INVOKER: RLS still applies; user_id is always forced to auth.uid().
create or replace function public.apply_changes(p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  d jsonb := coalesce(p -> 'delete', '{}'::jsonb);
  u jsonb := coalesce(p -> 'upsert', '{}'::jsonb);
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  -- deletes (children first; FKs are deferred anyway)
  delete from installments where user_id = uid and id in (select jsonb_array_elements_text(coalesce(d -> 'installments', '[]')));
  delete from expenses where user_id = uid and id in (select jsonb_array_elements_text(coalesce(d -> 'expenses', '[]')));
  delete from recurring_occurrences where user_id = uid and id in (select jsonb_array_elements_text(coalesce(d -> 'recurring_occurrences', '[]')));
  delete from recurring_rules where user_id = uid and id in (select jsonb_array_elements_text(coalesce(d -> 'recurring_rules', '[]')));
  delete from planned_purchases where user_id = uid and id in (select jsonb_array_elements_text(coalesce(d -> 'planned_purchases', '[]')));
  delete from budgets where user_id = uid and id in (select jsonb_array_elements_text(coalesce(d -> 'budgets', '[]')));
  delete from categories where user_id = uid and id in (select jsonb_array_elements_text(coalesce(d -> 'categories', '[]')));

  if p ? 'settings' and jsonb_typeof(p -> 'settings') = 'object' then
    insert into settings (user_id, accounting_policy, card_cutoff_day, card_billing_day, notify_70, notify_90,
                          notify_100, notify_pace, onboarded, updated_at)
    select uid, r.accounting_policy, r.card_cutoff_day, r.card_billing_day, r.notify_70, r.notify_90,
           r.notify_100, r.notify_pace, r.onboarded, coalesce(r.updated_at, now())
    from jsonb_populate_record(null::settings, p -> 'settings') r
    on conflict (user_id) do update set
      accounting_policy = excluded.accounting_policy, card_cutoff_day = excluded.card_cutoff_day,
      card_billing_day = excluded.card_billing_day, notify_70 = excluded.notify_70, notify_90 = excluded.notify_90,
      notify_100 = excluded.notify_100, notify_pace = excluded.notify_pace, onboarded = excluded.onboarded,
      updated_at = excluded.updated_at;
  end if;

  insert into budgets (id, user_id, effective_cycle, amount, created_at)
  select r.id, uid, r.effective_cycle, r.amount, coalesce(r.created_at, now())
  from jsonb_populate_recordset(null::budgets, coalesce(u -> 'budgets', '[]')) r
  on conflict (id) do update set effective_cycle = excluded.effective_cycle, amount = excluded.amount;

  insert into categories (id, user_id, name, icon, color, sort_order, monthly_budget, is_discretionary, created_at)
  select r.id, uid, r.name, r.icon, r.color, r.sort_order, r.monthly_budget, r.is_discretionary, coalesce(r.created_at, now())
  from jsonb_populate_recordset(null::categories, coalesce(u -> 'categories', '[]')) r
  on conflict (id) do update set name = excluded.name, icon = excluded.icon, color = excluded.color,
    sort_order = excluded.sort_order, monthly_budget = excluded.monthly_budget, is_discretionary = excluded.is_discretionary;

  insert into recurring_rules (id, user_id, description, amount, category_id, payment_method, day_of_month,
                               start_date, end_date, active, created_at, updated_at)
  select r.id, uid, r.description, r.amount, r.category_id, r.payment_method, r.day_of_month, r.start_date,
         r.end_date, r.active, coalesce(r.created_at, now()), coalesce(r.updated_at, now())
  from jsonb_populate_recordset(null::recurring_rules, coalesce(u -> 'recurring_rules', '[]')) r
  on conflict (id) do update set description = excluded.description, amount = excluded.amount,
    category_id = excluded.category_id, payment_method = excluded.payment_method, day_of_month = excluded.day_of_month,
    start_date = excluded.start_date, end_date = excluded.end_date, active = excluded.active, updated_at = excluded.updated_at;

  insert into planned_purchases (id, user_id, description, amount, category_id, payment_method, installments_count,
                                 notes, status, expense_id, purchased_at, created_at, updated_at)
  select r.id, uid, r.description, r.amount, r.category_id, r.payment_method, r.installments_count, r.notes,
         r.status, r.expense_id, r.purchased_at, coalesce(r.created_at, now()), coalesce(r.updated_at, now())
  from jsonb_populate_recordset(null::planned_purchases, coalesce(u -> 'planned_purchases', '[]')) r
  on conflict (id) do update set description = excluded.description, amount = excluded.amount,
    category_id = excluded.category_id, payment_method = excluded.payment_method,
    installments_count = excluded.installments_count, notes = excluded.notes, status = excluded.status,
    expense_id = excluded.expense_id, purchased_at = excluded.purchased_at, updated_at = excluded.updated_at;

  insert into recurring_occurrences (id, user_id, rule_id, cycle_start, due_date, amount, status, expense_id, is_overridden)
  select r.id, uid, r.rule_id, r.cycle_start, r.due_date, r.amount, r.status, r.expense_id, r.is_overridden
  from jsonb_populate_recordset(null::recurring_occurrences, coalesce(u -> 'recurring_occurrences', '[]')) r
  on conflict (id) do update set due_date = excluded.due_date, amount = excluded.amount, status = excluded.status,
    expense_id = excluded.expense_id, is_overridden = excluded.is_overridden;

  insert into expenses (id, user_id, description, amount, category_id, purchase_date, payment_method,
                        installments_count, notes, source, recurring_occurrence_id, planned_purchase_id, created_at, updated_at)
  select r.id, uid, r.description, r.amount, r.category_id, r.purchase_date, r.payment_method, r.installments_count,
         r.notes, r.source, r.recurring_occurrence_id, r.planned_purchase_id, coalesce(r.created_at, now()),
         coalesce(r.updated_at, now())
  from jsonb_populate_recordset(null::expenses, coalesce(u -> 'expenses', '[]')) r
  on conflict (id) do update set description = excluded.description, amount = excluded.amount,
    category_id = excluded.category_id, purchase_date = excluded.purchase_date, payment_method = excluded.payment_method,
    installments_count = excluded.installments_count, notes = excluded.notes, source = excluded.source,
    recurring_occurrence_id = excluded.recurring_occurrence_id, planned_purchase_id = excluded.planned_purchase_id,
    updated_at = excluded.updated_at;

  insert into installments (id, user_id, expense_id, number, amount, charge_date)
  select r.id, uid, r.expense_id, r.number, r.amount, r.charge_date
  from jsonb_populate_recordset(null::installments, coalesce(u -> 'installments', '[]')) r
  on conflict (id) do update set amount = excluded.amount, charge_date = excluded.charge_date, number = excluded.number;
end $$;

revoke all on function public.apply_changes(jsonb) from public, anon;
grant execute on function public.apply_changes(jsonb) to authenticated;
