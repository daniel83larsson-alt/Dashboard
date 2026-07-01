-- DL Trainer — Supabase databasschema
-- Kör detta i Supabase SQL Editor

-- Profiler (utökar Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text,
  selected_sports text[] default '{}',
  llm_provider text default 'anthropic',
  llm_api_key_encrypted text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users see own profile" on public.profiles
  for all using (auth.uid() = id);

-- Strava tokens
create table public.strava_tokens (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  athlete_id bigint not null,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  updated_at timestamptz default now()
);
alter table public.strava_tokens enable row level security;
create policy "Users see own tokens" on public.strava_tokens
  for all using (auth.uid() = user_id);

-- Aktiviteter (synkade från Strava)
create table public.activities (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  strava_id bigint not null,
  sport_type text not null,
  name text not null,
  distance numeric not null default 0,
  moving_time integer not null default 0,
  elapsed_time integer not null default 0,
  average_speed numeric,
  max_speed numeric,
  average_heartrate numeric,
  max_heartrate numeric,
  average_watts numeric,
  max_watts numeric,
  start_date timestamptz not null,
  description text,
  raw_data jsonb,
  created_at timestamptz default now()
);
alter table public.activities enable row level security;
create policy "Users see own activities" on public.activities
  for all using (auth.uid() = user_id);
create unique index activities_user_strava_unique on public.activities(user_id, strava_id);
create index activities_user_sport on public.activities(user_id, sport_type);
create index activities_start_date on public.activities(start_date desc);

-- Mål
create table public.goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  sport_type text not null,
  goal_type text check (goal_type in ('event', 'metric', 'habit')) not null,
  title text not null,
  description text,
  target_value numeric,
  target_unit text,
  target_date date,
  sessions_per_week integer,
  status text default 'active' check (status in ('active', 'achieved', 'paused')),
  created_at timestamptz default now()
);
alter table public.goals enable row level security;
create policy "Users see own goals" on public.goals
  for all using (auth.uid() = user_id);

-- Coach-konversationer
create table public.coach_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  coach_id text not null,
  messages jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, coach_id)
);
alter table public.coach_sessions enable row level security;
create policy "Users see own sessions" on public.coach_sessions
  for all using (auth.uid() = user_id);

-- Chatt-säkerhet: flaggning och låsning vid misstänkt missbruk (kod-/prompt-
-- injektionsförsök, orelaterade frågor). Kör vid uppdatering av en befintlig databas:
alter table public.profiles add column if not exists flagged_attempts integer default 0;
alter table public.profiles add column if not exists locked boolean default false;
alter table public.profiles add column if not exists flag_log jsonb default '[]';

-- Admin: ger ditt eget konto (matchat på e-post) läs- och skrivrätt till alla
-- profiler, utan att öppna upp övriga tabeller (aktiviteter, mål, coach-
-- sessioner förblir privata per användare). Byt e-postadressen om det behövs.
-- Kör vid uppdatering av en befintlig databas:
create policy "Admin reads all profiles" on public.profiles
  for select using (lower(auth.jwt() ->> 'email') = lower('daniel83larsson@gmail.com'));
create policy "Admin updates all profiles" on public.profiles
  for update using (lower(auth.jwt() ->> 'email') = lower('daniel83larsson@gmail.com'));

-- Admin: vilka appar (Concept2/Garmin) varje användare har anslutit — bara
-- ja/nej, aldrig själva access-tokens/lösenorden. Körs som security definer
-- så den kan läsa concept2_tokens/coach_sessions trots att admin saknar
-- direkt SELECT-rättighet där; kontrollen sker inuti funktionen.
-- Kör vid uppdatering av en befintlig databas:
create or replace function public.admin_all_sync_status()
returns table(user_id uuid, has_concept2 boolean, has_garmin boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(auth.jwt() ->> 'email') != lower('daniel83larsson@gmail.com') then
    raise exception 'not authorized';
  end if;

  return query
  select
    p.id,
    exists(select 1 from public.concept2_tokens c where c.user_id = p.id),
    exists(select 1 from public.coach_sessions cs where cs.user_id = p.id and cs.coach_id = 'garmin_credentials')
  from public.profiles p;
end;
$$;
revoke all on function public.admin_all_sync_status() from public;
grant execute on function public.admin_all_sync_status() to authenticated;

-- Auto-skapa profil vid signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- SÄKERHETSFIX: strava_id hade en GLOBAL unik-constraint (delad mellan ALLA
-- användare) istället för att vara unik per användare. Alla synk-rutter gör
-- upsert med onConflict på strava_id, vilket innebär att om två olika DL
-- Trainer-konton någonsin synkar samma käll-ID (t.ex. samma Garmin/Concept2-
-- inloggning kopplad till två olika konton) skrevs user_id på den befintliga
-- raden över — passet bytte ägare till den som synkade sist. Detta är
-- troliga orsaken till att en användares pass synts på ett annat konto.
-- Kör vid uppdatering av en befintlig databas:
alter table public.activities drop constraint if exists activities_strava_id_key;
create unique index if not exists activities_user_strava_unique
  on public.activities(user_id, strava_id);

-- Förhindrar att samma Garmin/Concept2/Strava-konto kopplas till flera olika
-- DL Trainer-profiler (t.ex. en familj som delar en Garmin-inloggning) — det
-- var precis den typen av delning som orsakade att pass hamnade på fel
-- användare innan strava_id-fixen ovan. external_id är e-post (Garmin,
-- normaliserad till gemener) eller leverantörens egna konto-id
-- (Concept2/Strava) — primärnyckeln (provider, external_id) garanterar att
-- varje riktigt konto bara kan höra till EN DL Trainer-profil åt gången.
-- Kör vid uppdatering av en befintlig databas:
create table if not exists public.connected_accounts (
  provider text not null check (provider in ('garmin', 'concept2', 'strava')),
  external_id text not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (provider, external_id)
);
alter table public.connected_accounts enable row level security;
create policy "Users see own connections" on public.connected_accounts
  for select using (auth.uid() = user_id);

-- Anropas innan vi sparar Garmin/Concept2/Strava-uppgifter. Kastar ett fel om
-- kontot redan är kopplat till en ANNAN användare (utan att avslöja vem),
-- annars flyttar kopplingen till den anropande användaren atomärt.
create or replace function public.claim_connected_account(p_provider text, p_external_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.connected_accounts
    where provider = p_provider and external_id = p_external_id and user_id != auth.uid()
  ) then
    raise exception 'already_connected';
  end if;

  delete from public.connected_accounts
  where provider = p_provider and user_id = auth.uid() and external_id != p_external_id;

  insert into public.connected_accounts (provider, external_id, user_id)
  values (p_provider, p_external_id, auth.uid())
  on conflict (provider, external_id) do nothing;
end;
$$;
revoke all on function public.claim_connected_account(text, text) from public;
grant execute on function public.claim_connected_account(text, text) to authenticated;
