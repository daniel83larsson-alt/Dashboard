-- Hemkoll — nya tabeller i SAMMA Supabase-projekt som DL Trainer, men helt
-- isolerade från dess tabeller (egen "hemkoll_"-prefix, egen RLS per
-- auth.uid()). Delar bara inloggningssystemet (auth.users), inte data.
-- Kör i Supabase SQL Editor. Säker att köra om — create table och create
-- policy är båda skyddade mot att köras flera gånger.

create extension if not exists pgcrypto;

create table if not exists public.hemkoll_house_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text,
  purchase_date date,
  warranty_until date,
  location text,
  notes text,
  created_at timestamptz default now()
);
alter table public.hemkoll_house_items enable row level security;
drop policy if exists "Users manage own house items" on public.hemkoll_house_items;
create policy "Users manage own house items" on public.hemkoll_house_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.hemkoll_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  item_id uuid references public.hemkoll_house_items(id) on delete cascade,
  title text not null,
  event_date date not null,
  cost numeric,
  notes text,
  created_at timestamptz default now()
);
alter table public.hemkoll_events enable row level security;
drop policy if exists "Users manage own house events" on public.hemkoll_events;
create policy "Users manage own house events" on public.hemkoll_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Strukturerad husdata (byggår, boyta, uppvärmning m.m.), fylls i manuellt
-- eller av importagenten som läser en prospekt-/annonslänk/fritext/dokument.
create table if not exists public.hemkoll_house_profile (
  user_id uuid references auth.users(id) on delete cascade primary key,
  address text,
  build_year int,
  living_area_sqm numeric,
  heating_type text,
  energy_class text,
  source_url text,
  raw_extracted jsonb default '{}',
  updated_at timestamptz default now()
);
alter table public.hemkoll_house_profile enable row level security;
drop policy if exists "Users manage own house profile" on public.hemkoll_house_profile;
create policy "Users manage own house profile" on public.hemkoll_house_profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Utökning: köp, källare och flera uppvärmningssystem samtidigt (många hus
-- kombinerar t.ex. pelletspanna + solceller + vedkamin). heating_type lever
-- kvar som en kort sammanfattning; heating_systems är listan med detaljer.
alter table public.hemkoll_house_profile add column if not exists purchase_price_sek numeric;
alter table public.hemkoll_house_profile add column if not exists purchase_year int;
alter table public.hemkoll_house_profile add column if not exists basement_area_sqm numeric;
alter table public.hemkoll_house_profile add column if not exists smart_home_platform text;
alter table public.hemkoll_house_profile add column if not exists heating_systems jsonb default '[]';

-- Utökning 2: matchar fältdjupet i ett riktigt mäklarprospekt/Hemnet-annons
-- (research 2026-07-04 — se STATUS.md). driftskostnad var tidigare inte alls
-- fångad; sparas nu som en strukturerad uppdelning (samma kategorier som
-- branschens egna exempel: värme, el, vatten/avlopp, sophämtning,
-- försäkring, sotning, samfällighet, övrigt) istället för bara en totalsumma.
alter table public.hemkoll_house_profile add column if not exists plot_area_sqm numeric;
alter table public.hemkoll_house_profile add column if not exists rooms numeric;
alter table public.hemkoll_house_profile add column if not exists building_type text;
alter table public.hemkoll_house_profile add column if not exists assessed_value_sek numeric;
alter table public.hemkoll_house_profile add column if not exists energy_performance_kwh_sqm numeric;
alter table public.hemkoll_house_profile add column if not exists operating_cost_sek jsonb;

create table if not exists public.hemkoll_advisor_sessions (
  user_id uuid references auth.users(id) on delete cascade primary key,
  messages jsonb default '[]',
  updated_at timestamptz default now()
);
alter table public.hemkoll_advisor_sessions enable row level security;
drop policy if exists "Users manage own advisor session" on public.hemkoll_advisor_sessions;
create policy "Users manage own advisor session" on public.hemkoll_advisor_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Homey OAuth2-koppling. `token` speglar homey-api-paketets egen Token-form
-- (token_type, access_token, refresh_token, expires_in, grant_type) så att
-- SDK:ts inbyggda auto-refresh kan läsa/skriva den direkt via en egen
-- StorageAdapter (se src/lib/homey.ts). Bara läsrättigheter används mot
-- Homeys API — ingen styrning av enheter.
create table if not exists public.hemkoll_homey_connections (
  user_id uuid references auth.users(id) on delete cascade primary key,
  token jsonb not null,
  connected_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.hemkoll_homey_connections enable row level security;
drop policy if exists "Users manage own homey connection" on public.hemkoll_homey_connections;
create policy "Users manage own homey connection" on public.hemkoll_homey_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
