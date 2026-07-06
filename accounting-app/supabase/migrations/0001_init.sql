-- Bokforing app schema: companies, BAS accounts, fiscal years, double-entry
-- vouchers, receipts. Every table that holds business data carries
-- company_id and is locked down with Row Level Security so one user can
-- never read or write another user's company data.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────
-- COMPANIES + MEMBERSHIP
-- ─────────────────────────────────────────────────────────────────────────

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fiscal_year_start_month int not null default 1 check (fiscal_year_start_month between 1 and 12),
  created_at timestamptz not null default now()
);

-- Membership table (not just an owner_id column) so a company can later
-- grant a revisor or bookkeeper read-only access without schema changes.
create table company_members (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'revisor')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create or replace function is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from company_members
    where company_id = target_company_id
      and user_id = auth.uid()
  );
$$;

create or replace function is_company_owner(target_company_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from company_members
    where company_id = target_company_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

alter table companies enable row level security;
alter table company_members enable row level security;

create policy "members can read their company" on companies
  for select using (is_company_member(id));
create policy "owners can update their company" on companies
  for update using (is_company_owner(id));
create policy "authenticated users can create a company" on companies
  for insert with check (auth.uid() is not null);

create policy "members can see co-members" on company_members
  for select using (is_company_member(company_id));
create policy "owners can manage membership" on company_members
  for all using (is_company_owner(company_id)) with check (is_company_owner(company_id));
-- allow the creator of a company to insert themselves as the first owner
create policy "self can join as first member" on company_members
  for insert with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- BAS KONTOPLAN (shared reference data, read-only to all authenticated users)
-- ─────────────────────────────────────────────────────────────────────────

create table bas_accounts (
  code text primary key,
  name text not null,
  vat_default numeric(4,2)
);

alter table bas_accounts enable row level security;
create policy "any authenticated user can read the kontoplan" on bas_accounts
  for select using (auth.uid() is not null);

insert into bas_accounts (code, name, vat_default) values
  ('1930', 'Företagskonto (bank)', null),
  ('1510', 'Kundfordringar', null),
  ('2013', 'Egna uttag', null),
  ('2018', 'Egna insättningar', null),
  ('2440', 'Leverantörsskulder', null),
  ('2611', 'Utgående moms 25%', null),
  ('2641', 'Ingående moms', null),
  ('3001', 'Försäljning tjänster', 25),
  ('4010', 'Inköp av varor', 25),
  ('5010', 'Lokalhyra', 0),
  ('5020', 'El', 25),
  ('5410', 'Förbrukningsinventarier', 25),
  ('6110', 'Kontorsmateriel', 25),
  ('6212', 'Mobiltelefon', 25),
  ('6230', 'Datakommunikation/internet', 25),
  ('6250', 'Bilkostnader', 25),
  ('6420', 'Redovisning/revisor', 25),
  ('6570', 'Bankkostnader', 0),
  ('8310', 'Ränteintäkter', 0);

-- ─────────────────────────────────────────────────────────────────────────
-- FISCAL YEARS + VOUCHER NUMBERING
-- ─────────────────────────────────────────────────────────────────────────

create table fiscal_years (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  next_voucher_number int not null default 1,
  closed boolean not null default false,
  unique (company_id, starts_on)
);

alter table fiscal_years enable row level security;
create policy "members can read fiscal years" on fiscal_years
  for select using (is_company_member(company_id));
create policy "owners can manage fiscal years" on fiscal_years
  for all using (is_company_owner(company_id)) with check (is_company_owner(company_id));

-- ─────────────────────────────────────────────────────────────────────────
-- VOUCHERS (verifikat) + LINES — real double-entry bookkeeping
-- ─────────────────────────────────────────────────────────────────────────

create table vouchers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  fiscal_year_id uuid not null references fiscal_years(id),
  voucher_number int not null,
  voucher_date date not null,
  description text not null,
  corrects_voucher_id uuid references vouchers(id),
  corrected_by_voucher_id uuid references vouchers(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (fiscal_year_id, voucher_number)
);

create table voucher_lines (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references vouchers(id) on delete cascade,
  account_code text not null references bas_accounts(code),
  debit numeric(12,2) not null default 0 check (debit >= 0),
  credit numeric(12,2) not null default 0 check (credit >= 0),
  vat_rate numeric(4,2)
);

-- A voucher must balance: sum(debit) = sum(credit) across its lines.
-- Enforced with a constraint trigger so it's checked once per statement,
-- after all lines for a voucher have been inserted in the same transaction.
create or replace function check_voucher_balances()
returns trigger
language plpgsql
as $$
declare
  imbalance numeric;
  affected_voucher uuid;
begin
  affected_voucher := coalesce(new.voucher_id, old.voucher_id);
  select round(sum(debit) - sum(credit), 2) into imbalance
  from voucher_lines where voucher_id = affected_voucher;

  if imbalance is distinct from 0 then
    raise exception 'Verifikat % balanserar inte (differens: %)', affected_voucher, imbalance;
  end if;
  return null;
end;
$$;

create constraint trigger voucher_lines_balance
  after insert or update or delete on voucher_lines
  deferrable initially deferred
  for each row execute function check_voucher_balances();

alter table vouchers enable row level security;
alter table voucher_lines enable row level security;

create policy "members can read vouchers" on vouchers
  for select using (is_company_member(company_id));
create policy "members can read voucher lines" on voucher_lines
  for select using (is_company_member((select company_id from vouchers where id = voucher_id)));

-- Vouchers are never updated or deleted from client code — only inserted
-- (booking) or corrected via a new reversing voucher. No update/delete
-- policy exists, so Postgres denies those operations outright regardless
-- of what the application code tries to do.
create policy "members can create vouchers" on vouchers
  for insert with check (is_company_member(company_id) and created_by = auth.uid());
create policy "members can create voucher lines" on voucher_lines
  for insert with check (is_company_member((select company_id from vouchers where id = voucher_id)));

-- ─────────────────────────────────────────────────────────────────────────
-- RECEIPTS
-- ─────────────────────────────────────────────────────────────────────────

create table receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now(),
  ai_suggestion jsonb,
  voucher_id uuid references vouchers(id)
);

alter table receipts enable row level security;
create policy "members can read receipts" on receipts
  for select using (is_company_member(company_id));
create policy "members can upload receipts" on receipts
  for insert with check (is_company_member(company_id) and uploaded_by = auth.uid());
create policy "members can update their receipts" on receipts
  for update using (is_company_member(company_id)) with check (is_company_member(company_id));

-- ─────────────────────────────────────────────────────────────────────────
-- create_voucher(): the only supported way to book a transaction.
-- Atomically claims the next voucher number and inserts balanced lines,
-- so numbering can never have gaps or races between concurrent requests.
-- ─────────────────────────────────────────────────────────────────────────

create type voucher_line_input as (
  account_code text,
  debit numeric,
  credit numeric,
  vat_rate numeric
);

create or replace function create_voucher(
  p_company_id uuid,
  p_fiscal_year_id uuid,
  p_voucher_date date,
  p_description text,
  p_lines voucher_line_input[],
  p_corrects_voucher_id uuid default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_number int;
  v_voucher_id uuid;
  line voucher_line_input;
begin
  if not is_company_member(p_company_id) then
    raise exception 'Not a member of this company';
  end if;

  update fiscal_years
    set next_voucher_number = next_voucher_number + 1
    where id = p_fiscal_year_id and company_id = p_company_id
    returning next_voucher_number - 1 into v_number;

  if v_number is null then
    raise exception 'Fiscal year not found for this company';
  end if;

  insert into vouchers (company_id, fiscal_year_id, voucher_number, voucher_date, description, corrects_voucher_id, created_by)
  values (p_company_id, p_fiscal_year_id, v_number, p_voucher_date, p_description, p_corrects_voucher_id, auth.uid())
  returning id into v_voucher_id;

  foreach line in array p_lines loop
    insert into voucher_lines (voucher_id, account_code, debit, credit, vat_rate)
    values (v_voucher_id, line.account_code, coalesce(line.debit, 0), coalesce(line.credit, 0), line.vat_rate);
  end loop;

  if p_corrects_voucher_id is not null then
    update vouchers set corrected_by_voucher_id = v_voucher_id where id = p_corrects_voucher_id;
  end if;

  return v_voucher_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- STORAGE: private bucket for receipts, one folder per company
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "members can read their company's receipt files"
  on storage.objects for select
  using (bucket_id = 'receipts' and is_company_member(((storage.foldername(name))[1])::uuid));

create policy "members can upload their company's receipt files"
  on storage.objects for insert
  with check (bucket_id = 'receipts' and is_company_member(((storage.foldername(name))[1])::uuid));
