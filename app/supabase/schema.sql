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
  strava_id bigint unique not null,
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
  for select using (auth.jwt() ->> 'email' = 'daniel83larsson@gmail.com');
create policy "Admin updates all profiles" on public.profiles
  for update using (auth.jwt() ->> 'email' = 'daniel83larsson@gmail.com');

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
