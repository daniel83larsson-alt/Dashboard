-- DL Trainer — Supabase databasschema
-- Kör detta i Supabase SQL Editor

-- Profiler (utökar Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text,
  selected_sports text[] default '{}',
  llm_provider text default 'gemini',
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
--
-- has_concept2/has_garmin betyder bara "uppgifter sparade" (verifierade mot
-- källan VID SPARANDET, men säger inget om just nu). concept2_synced/
-- garmin_synced betyder "minst ett pass har faktiskt synkats" — Concept2-pass
-- lagras med negativt strava_id, Garmin-pass med positivt/noll, så de går
-- att skilja åt utan en egen källa-kolumn. Badgen i UI:t ska vara grön bara
-- när BÅDA är sanna, inte bara "uppgifter sparade en gång".
-- Kör vid uppdatering av en befintlig databas:
drop function if exists public.admin_all_sync_status();
create function public.admin_all_sync_status()
returns table(user_id uuid, has_concept2 boolean, has_garmin boolean, concept2_synced boolean, garmin_synced boolean)
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
    exists(select 1 from public.coach_sessions cs where cs.user_id = p.id and cs.coach_id = 'garmin_credentials'),
    exists(select 1 from public.activities a where a.user_id = p.id and a.strava_id < 0),
    exists(select 1 from public.activities a where a.user_id = p.id and a.strava_id >= 0)
  from public.profiles p;
end;
$$;
revoke all on function public.admin_all_sync_status() from public;
grant execute on function public.admin_all_sync_status() to authenticated;

-- Admin: antal loggade pass, antal distinkta dagar med minst ett pass, och
-- senaste synktillfälle per användare — en snabb koll på om någon
-- faktiskt använder appen och om synken fungerar. Räknar rader i
-- activities rakt av (kan inkludera ett fåtal Concept2+Garmin-par av
-- samma pass som två rader — det slås ihop i UI:t men inte här).
-- Kör vid uppdatering av en befintlig databas:
create or replace function public.admin_activity_stats()
returns table(user_id uuid, activity_count bigint, days_synced bigint, last_synced timestamptz)
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
    a.user_id,
    count(*)::bigint,
    count(distinct a.start_date::date)::bigint,
    max(a.start_date)
  from public.activities a
  group by a.user_id;
end;
$$;
revoke all on function public.admin_activity_stats() from public;
grant execute on function public.admin_activity_stats() to authenticated;

-- Admin: lämnar ut EN användares lagrade (krypterade) Garmin-inloggning, bara
-- till servern — aldrig till klienten. Används av /api/admin/test-garmin för
-- att verifiera att en specifik användares Garmin-koppling faktiskt går att
-- logga in med, utan att admin själv någonsin ser lösenordet.
-- Kör vid uppdatering av en befintlig databas:
create or replace function public.admin_get_garmin_credentials(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(auth.jwt() ->> 'email') != lower('daniel83larsson@gmail.com') then
    raise exception 'not authorized';
  end if;

  return (
    select messages->0->>'content'
    from public.coach_sessions
    where user_id = target_user_id and coach_id = 'garmin_credentials'
    limit 1
  );
end;
$$;
revoke all on function public.admin_get_garmin_credentials(uuid) from public;
grant execute on function public.admin_get_garmin_credentials(uuid) to authenticated;

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

-- SÄKERHETSFIX: "Admin reads all profiles" gav SELECT på hela profiles-raden
-- (RLS filtrerar rader, inte kolumner) — inklusive llm_api_key_encrypted
-- (användares egna Anthropic/OpenAI/Gemini-nycklar) och flag_log (utdrag ur
-- privata chattmeddelanden). Kommentaren ovanför policyn sa uttryckligen att
-- avsikten bara var att kunna administrera konton, inte läsa hemligheter.
-- Byter den breda SELECT-policyn mot en security-definer-funktion som bara
-- returnerar de kolumner adminsidan faktiskt använder — samma mönster som
-- admin_all_sync_status(). Kör vid uppdatering av en befintlig databas:
drop policy if exists "Admin reads all profiles" on public.profiles;

create or replace function public.admin_list_profiles()
returns table(id uuid, email text, name text, created_at timestamptz, locked boolean, flagged_attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(auth.jwt() ->> 'email') != lower('daniel83larsson@gmail.com') then
    raise exception 'not authorized';
  end if;

  return query
  select p.id, p.email, p.name, p.created_at, p.locked, p.flagged_attempts
  from public.profiles p
  order by p.created_at desc;
end;
$$;
revoke all on function public.admin_list_profiles() from public;
grant execute on function public.admin_list_profiles() to authenticated;

-- Utrustning hemma + aktiviteter/sporter man utövar, så coach-teamets tips
-- (Roddcoach, Styrkecoach m.fl.) kan utgå från vad som faktiskt finns
-- tillgängligt istället för att gissa (Daniel: Jonas fick ett förslag om
-- roddmaskin trots att han inte har en). selected_sports fanns redan i
-- schemat men användes aldrig i koden — återanvänds nu för aktiviteter.
alter table public.profiles add column if not exists home_equipment text[] default '{}';

-- Onboarding-påminnelse + "intervju efter 1 månad utan ifyllt" (Daniel:
-- feedback från en användare som saknade mål/kontext). dismissed_at
-- snoozar den lätta förstasides-banderollen; last_onboarding_prompt_at
-- styr hur ofta den mer påstridiga intervju-rutan får dyka upp igen.
alter table public.profiles add column if not exists onboarding_dismissed_at timestamptz;
alter table public.profiles add column if not exists last_onboarding_prompt_at timestamptz;

-- Anropslogg för admin-missbrukskoll (Daniel: "koll på antal anrop per dag
-- per användare, ifall någon missbrukar"). Loggar bara de anrop som kostar
-- pengar eller kan träffa en extern tjänsts gräns — AI (coach/insikter/plan),
-- Garmin/Concept2-synk, Rutter-sök. Vanlig sidnavigering loggas inte.
-- Kör vid uppdatering av en befintlig databas:
create table if not exists public.api_call_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  route text not null,
  created_at timestamptz not null default now()
);
create index if not exists api_call_log_user_created_idx on public.api_call_log (user_id, created_at desc);

alter table public.api_call_log enable row level security;
-- En användare får bara logga sina egna anrop (och aldrig läsa loggen
-- direkt — det sker bara via admin_api_call_stats() nedan).
create policy "users log their own calls" on public.api_call_log
  for insert with check (auth.uid() = user_id);

-- Admin: antal loggade anrop idag och senaste 7 dagarna per användare.
-- Kör vid uppdatering av en befintlig databas:
create or replace function public.admin_api_call_stats()
returns table(user_id uuid, calls_today bigint, calls_7d bigint)
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
    l.user_id,
    count(*) filter (where l.created_at >= date_trunc('day', now()))::bigint,
    count(*) filter (where l.created_at >= now() - interval '7 days')::bigint
  from public.api_call_log l
  group by l.user_id;
end;
$$;
revoke all on function public.admin_api_call_stats() from public;
grant execute on function public.admin_api_call_stats() to authenticated;

-- Admin: senaste händelser (nya registreringar + nya loggade pass) i en
-- gemensam, tidssorterad lista, så Daniel snabbt kan se "vem gjorde vad
-- nyss" utan att gå igenom varje användarrad för sig.
-- Kör vid uppdatering av en befintlig databas:
create or replace function public.admin_recent_events()
returns table(event_type text, user_id uuid, email text, name text, label text, occurred_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(auth.jwt() ->> 'email') != lower('daniel83larsson@gmail.com') then
    raise exception 'not authorized';
  end if;

  return query
  select * from (
    (
      select 'signup'::text as event_type, p.id as user_id, p.email, p.name, 'Nytt konto'::text as label, p.created_at as occurred_at
      from public.profiles p
      order by p.created_at desc
      limit 10
    )
    union all
    (
      select 'activity'::text as event_type, a.user_id, p.email, p.name, a.name as label, a.created_at as occurred_at
      from public.activities a
      join public.profiles p on p.id = a.user_id
      order by a.created_at desc
      limit 10
    )
  ) combined
  order by occurred_at desc
  limit 10;
end;
$$;
revoke all on function public.admin_recent_events() from public;
grant execute on function public.admin_recent_events() to authenticated;

-- Daniel: "kunna sätta ett stegmål per dag, och streak på det" — settable
-- under Profil, defaults to the 10 000 that was already hardcoded into the
-- Översikt/Hälsa steg-progressbars before this existed.
alter table public.profiles add column if not exists daily_step_goal integer not null default 10000;

-- Daniel: "söka vänner, följ dem, de godkänner, se deras aktivitetslogg."
-- Asymmetric follow model (like Strava), not mutual friending: follower_id
-- sends a request, followee_id must accept before the follower can see
-- their activity feed. profiles RLS ("auth.uid() = id") means one user can
-- never directly read another's row, so search/list of other users' names
-- all go through narrow SECURITY DEFINER functions below that return only
-- a name (never email) and only what the calling user is entitled to see.
create table public.follows (
  id uuid default gen_random_uuid() primary key,
  follower_id uuid references public.profiles(id) on delete cascade not null,
  followee_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now(),
  responded_at timestamptz,
  unique (follower_id, followee_id),
  check (follower_id != followee_id)
);
alter table public.follows enable row level security;

create policy "See own follow rows" on public.follows
  for select using (auth.uid() = follower_id or auth.uid() = followee_id);

create policy "Send own follow request" on public.follows
  for insert with check (auth.uid() = follower_id and status = 'pending');

create policy "Followee accepts a request" on public.follows
  for update using (auth.uid() = followee_id)
  with check (auth.uid() = followee_id and status = 'accepted');

create policy "Either side can remove a follow row" on public.follows
  for delete using (auth.uid() = follower_id or auth.uid() = followee_id);

-- Search other users by (partial) name to send a follow request. Never
-- returns email. Requires at least 2 characters to avoid a cheap full scan
-- turning into a browsable directory.
create or replace function public.search_profiles(query text)
returns table(id uuid, name text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.name
  from public.profiles p
  where p.id != auth.uid()
    and p.name is not null
    and length(query) >= 2
    and p.name ilike '%' || query || '%'
  order by p.name
  limit 20;
$$;
revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to authenticated;

-- Everyone I follow (pending or accepted), with their display name, so the
-- Profil page can show request status without ever reading others' rows
-- directly.
create or replace function public.my_follows()
returns table(id uuid, followee_id uuid, followee_name text, status text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select f.id, f.followee_id, coalesce(p.name, split_part(p.email, '@', 1)), f.status, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.followee_id
  where f.follower_id = auth.uid()
  order by f.created_at desc;
$$;
revoke all on function public.my_follows() from public;
grant execute on function public.my_follows() to authenticated;

-- Incoming follow requests still waiting for my approval.
create or replace function public.pending_follow_requests()
returns table(id uuid, follower_id uuid, follower_name text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select f.id, f.follower_id, coalesce(p.name, split_part(p.email, '@', 1)), f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.followee_id = auth.uid() and f.status = 'pending'
  order by f.created_at asc;
$$;
revoke all on function public.pending_follow_requests() from public;
grant execute on function public.pending_follow_requests() to authenticated;

-- Combined chronological feed of the last 10 activities across everyone
-- I follow (accepted only) — the "mina vänners träningspass" log on
-- Översikt. Security-definer so it doesn't need a broad new RLS select
-- policy on activities; the follows join already scopes it to auth.uid().
create or replace function public.friend_activity_feed()
returns table(
  activity_id uuid,
  owner_id uuid,
  owner_name text,
  sport_type text,
  activity_name text,
  distance numeric,
  moving_time integer,
  start_date timestamptz
)
language sql
security definer
set search_path = public
as $$
  select a.id, a.user_id, coalesce(p.name, split_part(p.email, '@', 1)), a.sport_type, a.name, a.distance, a.moving_time, a.start_date
  from public.activities a
  join public.profiles p on p.id = a.user_id
  join public.follows f on f.followee_id = a.user_id and f.follower_id = auth.uid() and f.status = 'accepted'
  order by a.start_date desc
  limit 10;
$$;
revoke all on function public.friend_activity_feed() from public;
grant execute on function public.friend_activity_feed() to authenticated;

-- Daniel: "'like' på en väns pass, så personen får se det på sin sida
-- ('tumme upp av kompis')." One kudos per (activity, giver) — can only
-- kudos an activity belonging to someone you actually follow (mirrors the
-- same visibility rule as the feed itself), and never your own activity.
create table public.activity_kudos (
  id uuid default gen_random_uuid() primary key,
  activity_id uuid references public.activities(id) on delete cascade not null,
  giver_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (activity_id, giver_id)
);
alter table public.activity_kudos enable row level security;

-- A plain `(select user_id from public.activities where id = ...)` inside a
-- policy runs under the CALLER's RLS on activities — which blocks it for
-- everyone except the activity's own owner, making any policy that embeds
-- it silently un-satisfiable for a follower kudos-ing someone else's
-- activity. Bypass with a narrow SECURITY DEFINER lookup instead.
create or replace function public.activity_owner(target_activity_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select user_id from public.activities where id = target_activity_id;
$$;
revoke all on function public.activity_owner(uuid) from public;
grant execute on function public.activity_owner(uuid) to authenticated;

create policy "Giver or activity owner can see a kudos row" on public.activity_kudos
  for select using (
    auth.uid() = giver_id
    or auth.uid() = public.activity_owner(activity_id)
  );

create policy "Can only kudos a followed friend's activity" on public.activity_kudos
  for insert with check (
    auth.uid() = giver_id
    and giver_id != public.activity_owner(activity_id)
    and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.followee_id = public.activity_owner(activity_id)
        and f.status = 'accepted'
    )
  );

create policy "Giver can remove own kudos" on public.activity_kudos
  for delete using (auth.uid() = giver_id);

-- friend_activity_feed() now also reports a kudos count and whether the
-- caller has already liked each entry, so the feed can render a toggleable
-- "gilla" button without a second round trip.
drop function public.friend_activity_feed();
create function public.friend_activity_feed()
returns table(
  activity_id uuid,
  owner_id uuid,
  owner_name text,
  sport_type text,
  activity_name text,
  distance numeric,
  moving_time integer,
  start_date timestamptz,
  kudos_count bigint,
  liked_by_me boolean
)
language sql
security definer
set search_path = public
as $$
  select
    a.id, a.user_id, coalesce(p.name, split_part(p.email, '@', 1)), a.sport_type, a.name, a.distance, a.moving_time, a.start_date,
    (select count(*) from public.activity_kudos k where k.activity_id = a.id),
    exists(select 1 from public.activity_kudos k2 where k2.activity_id = a.id and k2.giver_id = auth.uid())
  from public.activities a
  join public.profiles p on p.id = a.user_id
  join public.follows f on f.followee_id = a.user_id and f.follower_id = auth.uid() and f.status = 'accepted'
  order by a.start_date desc
  limit 10;
$$;
revoke all on function public.friend_activity_feed() from public;
grant execute on function public.friend_activity_feed() to authenticated;

-- "Den personen får upp på sin sida" — who liked MY activity. Only the
-- activity's own owner can call this successfully (returns an empty/zero
-- row for anyone else since the where-clause never matches).
create or replace function public.kudos_received(target_activity_id uuid)
returns table(kudos_count bigint, giver_names text[])
language sql
security definer
set search_path = public
as $$
  select count(*), coalesce(array_agg(coalesce(p.name, split_part(p.email, '@', 1)) order by k.created_at), '{}')
  from public.activity_kudos k
  join public.profiles p on p.id = k.giver_id
  join public.activities a on a.id = k.activity_id
  where k.activity_id = target_activity_id and a.user_id = auth.uid();
$$;
revoke all on function public.kudos_received(uuid) from public;
grant execute on function public.kudos_received(uuid) to authenticated;

-- Daniel: "nyhetsbrev till alla användare — nyheter i appen + lite
-- personligt, via Resend." Sent manually from an admin-only page, not on a
-- schedule — Daniel reviews the "nyheter i appen" text and hits send
-- himself each time.
alter table public.profiles add column if not exists newsletter_opt_out boolean not null default false;

create table public.newsletter_log (
  id bigint generated always as identity primary key,
  subject text not null,
  sent_count integer not null,
  sent_at timestamptz default now()
);
alter table public.newsletter_log enable row level security;
create policy "Admin only" on public.newsletter_log
  for all using (lower(auth.jwt() ->> 'email') = lower('daniel83larsson@gmail.com'));

-- Who to send to (opted-out users excluded) — email is needed here (unlike
-- the other admin_* functions above) because this is what actually
-- addresses the message, not just a label shown in an admin table.
create or replace function public.admin_newsletter_recipients()
returns table(id uuid, email text, name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(auth.jwt() ->> 'email') != lower('daniel83larsson@gmail.com') then
    raise exception 'not authorized';
  end if;

  return query
  select p.id, p.email, p.name
  from public.profiles p
  where p.newsletter_opt_out = false
  order by p.created_at asc;
end;
$$;
revoke all on function public.admin_newsletter_recipients() from public;
grant execute on function public.admin_newsletter_recipients() to authenticated;

-- Raw recent activities across ALL users (60 days — enough window for the
-- existing streak-calculation code in lib/streaks.ts to run correctly),
-- so the newsletter's personal section can reuse that exact same tested
-- logic in the sending route instead of re-implementing streaks in SQL.
create or replace function public.admin_recent_activities_for_newsletter()
returns table(user_id uuid, id uuid, start_date timestamptz, distance numeric, moving_time integer, sport_type text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(auth.jwt() ->> 'email') != lower('daniel83larsson@gmail.com') then
    raise exception 'not authorized';
  end if;

  return query
  select a.user_id, a.id, a.start_date, a.distance, a.moving_time, a.sport_type
  from public.activities a
  where a.start_date >= now() - interval '60 days'
  order by a.start_date desc;
end;
$$;
revoke all on function public.admin_recent_activities_for_newsletter() from public;
grant execute on function public.admin_recent_activities_for_newsletter() to authenticated;

-- Public unsubscribe link needs no auth — anyone holding this specific
-- user's id (a 122-bit random uuid, not guessable/enumerable) can opt that
-- one profile out. Same acceptable-risk shape as a typical transactional
-- unsubscribe link.
create or replace function public.unsubscribe_newsletter(target_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set newsletter_opt_out = true where id = target_user_id;
$$;
revoke all on function public.unsubscribe_newsletter(uuid) from public;
grant execute on function public.unsubscribe_newsletter(uuid) to anon, authenticated;

-- Manual pass logging ("Logga ditt pass") — needs body weight for the
-- MET-based calorie estimate, and activities needs somewhere to store the
-- resulting number. Both nullable: weight is optional (falls back to a
-- population-average estimate), calories stays empty for
-- Garmin/Concept2-synced passes that don't go through this calculator.
alter table public.profiles add column if not exists weight_kg numeric;
alter table public.activities add column if not exists calories integer;

-- Web Push subscriptions (one row per device/browser a user has enabled
-- notifications on) — needed for the four notification triggers Daniel
-- asked for: kudos, new record, streak reminder, daily sync results.
create table public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
create policy "Users manage own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id);
create index push_subscriptions_user on public.push_subscriptions(user_id);

-- SÄKERHETSFIX: connected_accounts (skydd mot att koppla någon annans
-- redan anslutna Garmin/Concept2-konto) infördes 5 juli, men konton som
-- kopplades INNAN dess registrerades aldrig i den — så systemet hade ingen
-- aning om att t.ex. Daniels egen Garmin-inloggning redan var upptagen.
-- Det gjorde det möjligt för en ny användare att av misstag koppla samma
-- Garmin-konto till sitt eget DL Trainer-konto utan att bli stoppad
-- (upptäckt när Connys nya konto fick Daniels riktiga Garmin-data).
-- Den här funktionen låter admin registrera en redan verifierad, befintlig
-- koppling i efterhand — skiljer sig från claim_connected_account() genom
-- att den INTE kräver att målanvändaren är inloggad (körs av admin, en gång,
-- för konton som kopplades innan skyddet fanns) och aldrig hanterar själva
-- lösenordet/token, bara det redan verifierade external_id.
create or replace function public.admin_backfill_connected_account(
  target_user_id uuid, p_provider text, p_external_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(auth.jwt() ->> 'email') != lower('daniel83larsson@gmail.com') then
    raise exception 'not authorized';
  end if;

  insert into public.connected_accounts (provider, external_id, user_id)
  values (p_provider, lower(p_external_id), target_user_id)
  on conflict (provider, external_id) do nothing;
end;
$$;
revoke all on function public.admin_backfill_connected_account(uuid, text, text) from public;
grant execute on function public.admin_backfill_connected_account(uuid, text, text) to authenticated;

-- VO2max — either Garmin's own already-computed value (fetched via the same
-- unofficial-endpoint pattern as HR zones/GPS routes, with the date it
-- refers to so a stale reading is visible) or, when Garmin doesn't provide
-- one (e.g. no supporting watch), a value we estimate ourselves from the
-- user's best recent qualifying run. vo2max_date is Garmin's calendarDate
-- for the 'garmin' source, or the date of the qualifying run for
-- 'estimated' — always shown alongside the number so it's clear how fresh
-- it is.
alter table public.profiles add column if not exists vo2max_value numeric;
alter table public.profiles add column if not exists vo2max_source text check (vo2max_source in ('garmin', 'estimated'));
alter table public.profiles add column if not exists vo2max_date date;

-- Weekly training load goal (optional) — how close to it you are is shown
-- on Översikt. Left null means "no explicit goal set", in which case the UI
-- compares against the user's own rolling recent average instead of forcing
-- a number on someone who hasn't thought about one yet.
alter table public.profiles add column if not exists weekly_load_goal numeric;

-- Kaloribudget-funktionen ("Mat"): BMR/TDEE kräver mer än vikten vi redan
-- har. Mifflin-St Jeor behöver längd, ålder och biologiskt kön. Alla
-- nullable — samma konvention som weight_kg: saknas de faller vi tillbaka
-- på ett tydligt märkt schablonvärde (se lib/bmr.ts) istället för att
-- blockera funktionen. birth_year istället för ålder direkt eftersom ålder
-- annars måste uppdateras varje år.
alter table public.profiles add column if not exists height_cm numeric;
alter table public.profiles add column if not exists birth_year integer;
alter table public.profiles add column if not exists biological_sex text
  check (biological_sex in ('male', 'female'));

-- Dagligt kalorimål (intag). Nullable och utan default — till skillnad från
-- stegmålet finns inget rimligt universellt värde; kortet uppmanar
-- användaren att sätta ett mål istället för att hitta på ett.
alter table public.profiles add column if not exists daily_calorie_goal integer;

-- Matloggen. calories är alltid server-beräknad/-validerad (se
-- /api/food/log) — aldrig ett klientskickat tal som sparas rakt av.
-- Snabbvalslistan är medvetet INTE en egen tabell utan härleds ur den här
-- (food_quick_picks nedan) — samma "härled istället för dubbellagra"-princip
-- som dedupeForStats/streaks redan använder, ingen risk för att en separat
-- favoritlista driftar isär från den faktiska loggen.
create table public.food_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  calories integer not null,
  source text not null check (source in ('database', 'ai_text', 'photo')),
  quantity numeric,
  unit text check (unit in ('g', 'portion')),
  kcal_per_100g numeric,
  off_id text,
  -- Protein, samma "kan saknas" som kcal_per_100g — inte varje OFF-produkt
  -- eller AI-uppskattning ger ett proteinvärde, så nullable snarare än 0.
  protein_g numeric,
  protein_per_100g numeric,
  logged_at timestamptz not null default now(),
  created_at timestamptz default now()
);
alter table public.food_log enable row level security;
create policy "Users see own food log" on public.food_log
  for all using (auth.uid() = user_id);
create index food_log_user_logged_idx on public.food_log (user_id, logged_at desc);
create index food_log_user_name_idx on public.food_log (user_id, lower(name));

-- Snabbval: distinkta rätter användaren loggat förr, med hur ofta + senast —
-- så listan kan rankas efter båda utan att klienten behöver göra jobbet.
create or replace function public.food_quick_picks()
returns table(name text, calories integer, source text, quantity numeric, unit text, kcal_per_100g numeric, off_id text, protein_g numeric, protein_per_100g numeric, times_logged bigint, last_logged timestamptz)
language sql
security definer
set search_path = public
as $$
  select distinct on (lower(f.name))
    f.name, f.calories, f.source, f.quantity, f.unit, f.kcal_per_100g, f.off_id, f.protein_g, f.protein_per_100g,
    count(*) over (partition by lower(f.name)) as times_logged,
    max(f.logged_at) over (partition by lower(f.name)) as last_logged
  from public.food_log f
  where f.user_id = auth.uid()
  order by lower(f.name), f.logged_at desc
$$;
revoke all on function public.food_quick_picks() from public;
grant execute on function public.food_quick_picks() to authenticated;

-- llm_provider defaulted to 'anthropic' since the original schema, which
-- made every new user's Profil-sida show "Claude" pre-selected even though
-- the shared free-tier fallback everywhere in the app (Insikter, Veckoplan,
-- Coach) is actually Gemini — purely a misleading default, never a real
-- functional bug (Coach only ever calls Anthropic when the user has BOTH
-- their own key AND this set to 'anthropic'). Fixed for new signups going
-- forward; existing rows updated below only where the value could only
-- ever have come from the default (no own key saved, so 'anthropic' was
-- never actually acted on for that account).
alter table public.profiles alter column llm_provider set default 'gemini';
update public.profiles set llm_provider = 'gemini'
  where llm_provider = 'anthropic' and llm_api_key_encrypted is null;

-- SÄKERHETSFIX: RLS-policyn "Users see own profile" (rad 15-16) saknar
-- WITH CHECK, så USING (auth.uid() = id) återanvänds som implicit check vid
-- UPDATE. Det avgör bara VILKEN rad en användare får ändra, inte VILKA
-- kolumner — vilket gjorde att en inloggad användare kunde köra
-- supabase.from('profiles').update({ locked: false, flagged_attempts: 0,
-- flag_log: [] }) direkt från klienten och själv låsa upp sitt konto,
-- vilket kringgår spärren mot missbruk av den delade Gemini-nyckeln i
-- /api/coach efter FLAG_THRESHOLD flaggade meddelanden. En trigger används
-- istället för en WITH CHECK-klausul eftersom vi behöver jämföra mot raden
-- INNAN uppdateringen (OLD), vilket bara en trigger har tillgång till.
-- Tillåter fortsatt: service-role (crontjobb/adminklient) och Daniels eget
-- admin-konto (samma e-postmatchning som "Admin updates all profiles").
create or replace function public.protect_profile_moderation_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and lower(coalesce(auth.jwt() ->> 'email', '')) <> lower('daniel83larsson@gmail.com') then
    new.locked := old.locked;
    new.flagged_attempts := old.flagged_attempts;
    new.flag_log := old.flag_log;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_moderation_columns on public.profiles;
create trigger protect_profile_moderation_columns
  before update on public.profiles
  for each row
  execute function public.protect_profile_moderation_columns();

-- Veckoplanering, ny modell: ersätter den gamla coach_sessions('weekly_plan')
-- JSON-klumpen (skrevs över varje gång, ingen historik) med riktiga rader
-- per vecka och per planerat pass. training_plans har unique(user_id,
-- week_start) — regenerering av DENNA vecka skriver över samma rad, men
-- gamla veckor rörs aldrig, så historik för följsamhets-trenden finns
-- "gratis". week_start ska alltid vara måndagen från startOfWeek() i koden.
create table public.training_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  week_start date not null,
  plan_type text check (plan_type in ('mot_mal', 'adaptiv')) not null,
  philosophy text,
  focus_areas text[] default '{}',
  goal_id uuid references public.goals(id) on delete set null,
  status text default 'active' check (status in ('active', 'completed')),
  -- Sport-nycklar (samma vokabulär som activities.sport_type/SPORT_LABELS)
  -- atleten kryssade i vid generering, om något — tomt betyder "AI:n fick
  -- gissa utifrån historiken", som tidigare. Sparas dels för spårbarhet,
  -- dels så nästa veckas Veckoplan-sida kan förifylla samma val.
  requested_sports text[] default '{}',
  generated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id, week_start)
);
alter table public.training_plans enable row level security;
create policy "Users see own training plans" on public.training_plans
  for all using (auth.uid() = user_id);
create index training_plans_user_week on public.training_plans(user_id, week_start);

-- user_id är denormaliserad hit (finns redan via plan_id → training_plans)
-- så att RLS-policyn kan vara samma enkla auth.uid() = user_id-form som
-- alla andra tabeller, istället för en subquery mot en annan tabell (som
-- activity_owner-kommentaren tidigare i filen varnar för — en subquery
-- körs under anroparens egen RLS och kan tyst gå sönder).
create table public.plan_sessions (
  id uuid default gen_random_uuid() primary key,
  plan_id uuid references public.training_plans(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  planned_date date not null,
  is_rest boolean default false,
  sport_type text,
  title text not null,
  description text,
  status text default 'planned' check (status in ('planned', 'done', 'skipped', 'missed')),
  matched_activity_id uuid references public.activities(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz default now()
);
alter table public.plan_sessions enable row level security;
create policy "Users see own plan sessions" on public.plan_sessions
  for all using (auth.uid() = user_id);
create index plan_sessions_user_date on public.plan_sessions(user_id, planned_date);
create index plan_sessions_plan on public.plan_sessions(plan_id);

-- Ett coach-föreslaget mål landar som 'proposed' — osynligt för
-- veckoplaneringen (som redan filtrerar status='active') tills Daniel
-- godkänner det i UI:t och det blir 'active'. Ingen extra spärr-logik
-- behövs i generate-routen för det här, filtreringen gör jobbet automatiskt.
alter table public.goals drop constraint if exists goals_status_check;
alter table public.goals add constraint goals_status_check
  check (status in ('proposed', 'active', 'achieved', 'paused', 'rejected'));

-- Daniel: "blir man vän med någon ska man se varandras pass, inte att båda
-- måste följa varandra." follows stayed a directional request/accept row
-- (A requests B, B accepts) but both friend_activity_feed() and the kudos
-- insert policy only ever checked the ONE direction matching the caller as
-- follower — so B accepting A's request let B see A, but A couldn't see B
-- back without ALSO sending and having B accept a second, separate request.
-- Fixed by matching an accepted row in EITHER direction — a single
-- accept now grants mutual visibility, as "vän" implies. No data
-- migration needed: existing accepted rows already satisfy this either-
-- direction check regardless of which way they happened to be recorded.
drop function public.friend_activity_feed();
create function public.friend_activity_feed()
returns table(
  activity_id uuid,
  owner_id uuid,
  owner_name text,
  sport_type text,
  activity_name text,
  distance numeric,
  moving_time integer,
  start_date timestamptz,
  kudos_count bigint,
  liked_by_me boolean
)
language sql
security definer
set search_path = public
as $$
  select
    a.id, a.user_id, coalesce(p.name, split_part(p.email, '@', 1)), a.sport_type, a.name, a.distance, a.moving_time, a.start_date,
    (select count(*) from public.activity_kudos k where k.activity_id = a.id),
    exists(select 1 from public.activity_kudos k2 where k2.activity_id = a.id and k2.giver_id = auth.uid())
  from public.activities a
  join public.profiles p on p.id = a.user_id
  join public.follows f on f.status = 'accepted' and (
    (f.follower_id = auth.uid() and f.followee_id = a.user_id) or
    (f.followee_id = auth.uid() and f.follower_id = a.user_id)
  )
  order by a.start_date desc
  limit 10;
$$;
revoke all on function public.friend_activity_feed() from public;
grant execute on function public.friend_activity_feed() to authenticated;

drop policy "Can only kudos a followed friend's activity" on public.activity_kudos;
create policy "Can only kudos a friend's activity" on public.activity_kudos
  for insert with check (
    auth.uid() = giver_id
    and giver_id != public.activity_owner(activity_id)
    and exists (
      select 1 from public.follows f
      where f.status = 'accepted' and (
        (f.follower_id = auth.uid() and f.followee_id = public.activity_owner(activity_id)) or
        (f.followee_id = auth.uid() and f.follower_id = public.activity_owner(activity_id))
      )
    )
  );

-- "Veckans Recap" — en helhetsbild av veckans pass+hälsodata, skickas
-- söndagar. Separat på/av-läge från newsletter_opt_out (Daniels beslut,
-- se STATUS.md): en personlig hälsodata-sammanställning varje vecka är en
-- annan sorts mail än ett då-och-då-nyhetsbrev, så de ska kunna stängas av
-- oberoende av varandra.
alter table public.profiles add column if not exists weekly_digest_opt_out boolean not null default false;

-- Samma acceptable-risk-form som unsubscribe_newsletter ovan — publik länk,
-- ingen inloggning krävs, skyddas bara av att user_id är en ogissbar uuid.
create or replace function public.unsubscribe_weekly_digest(target_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set weekly_digest_opt_out = true where id = target_user_id;
$$;
revoke all on function public.unsubscribe_weekly_digest(uuid) from public;
grant execute on function public.unsubscribe_weekly_digest(uuid) to anon, authenticated;
