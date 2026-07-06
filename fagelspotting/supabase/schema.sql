-- Fågelspotting POC — full database definition. Run this whole file in the
-- Supabase SQL editor. Tables are prefixed birdspot_ because this POC shares
-- the bokforing Supabase project (Daniel's org is capped at 2 free projects,
-- both already in use) -- fully isolated from bokforing's own tables by
-- naming, not by a separate project/schema.

create table if not exists public.birdspot_species_rarity (
  id bigint generated always as identity primary key,
  common_name text not null,
  scientific_name text not null,
  rarity_score int not null check (rarity_score between 1 and 20)
);

alter table public.birdspot_species_rarity enable row level security;
create policy "anyone authenticated can read the species table" on public.birdspot_species_rarity
  for select using (auth.uid() is not null);

-- v1 starter set -- Swedish birds from very common (score 1-3) to genuinely
-- rare vagrants (score 18-20), loosely calibrated against how often each is
-- actually reported. Known limitation (documented, not solved now): an
-- AI-identified species missing from this table gets a neutral default of 5
-- at insert time in the app, not blocked.
insert into public.birdspot_species_rarity (common_name, scientific_name, rarity_score) values
  ('Gråsparv', 'Passer domesticus', 1),
  ('Blåmes', 'Cyanistes caeruleus', 1),
  ('Talgoxe', 'Parus major', 1),
  ('Koltrast', 'Turdus merula', 1),
  ('Skata', 'Pica pica', 2),
  ('Kråka', 'Corvus corone', 2),
  ('Björktrast', 'Turdus pilaris', 2),
  ('Bofink', 'Fringilla coelebs', 2),
  ('Gulsparv', 'Emberiza citrinella', 3),
  ('Sädesärla', 'Motacilla alba', 3),
  ('Ladusvala', 'Hirundo rustica', 3),
  ('Stare', 'Sturnus vulgaris', 3),
  ('Rödhake', 'Erithacus rubecula', 3),
  ('Nötväcka', 'Sitta europaea', 4),
  ('Grönfink', 'Chloris chloris', 4),
  ('Ringduva', 'Columba palumbus', 4),
  ('Sidensvans', 'Bombycilla garrulus', 5),
  ('Steglits', 'Carduelis carduelis', 5),
  ('Gröngöling', 'Picus viridis', 6),
  ('Större hackspett', 'Dendrocopos major', 5),
  ('Tornseglare', 'Apus apus', 5),
  ('Sparvhök', 'Accipiter nisus', 7),
  ('Duvhök', 'Accipiter gentilis', 9),
  ('Ormvråk', 'Buteo buteo', 6),
  ('Fiskgjuse', 'Pandion haliaetus', 10),
  ('Havsörn', 'Haliaeetus albicilla', 12),
  ('Kungsfiskare', 'Alcedo atthis', 11),
  ('Härfågel', 'Upupa epops', 15),
  ('Aftonfalk', 'Falco vespertinus', 16),
  ('Blåkråka', 'Coracias garrulus', 18),
  ('Svarthakad buskskvätta', 'Saxicola rubicola', 8),
  ('Mindre flugsnappare', 'Ficedula parva', 13),
  ('Vitryggig hackspett', 'Dendrocopos leucotos', 17),
  ('Berguv', 'Bubo bubo', 14),
  ('Pilgrimsfalk', 'Falco peregrinus', 13),
  ('Trana', 'Grus grus', 6),
  ('Storspov', 'Numenius arquata', 8),
  ('Enkelbeckasin', 'Gallinago gallinago', 7),
  ('Rördrom', 'Botaurus stellaris', 14),
  ('Vaktel', 'Coturnix coturnix', 12),
  ('Svart glada', 'Milvus migrans', 16),
  ('Snöuggla', 'Bubo scandiacus', 19),
  ('Stjärtmes', 'Aegithalos caudatus', 5),
  ('Lappuggla', 'Strix nebulosa', 20)
on conflict do nothing;

create table if not exists public.birdspot_sightings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  species_rarity_id bigint references public.birdspot_species_rarity(id),
  species_name text not null,
  photo_url text not null,
  -- Copy of rarity_score at the time of the sighting so historical scores
  -- never shift if the rarity table is retuned later.
  score_awarded int not null check (score_awarded between 1 and 20),
  created_at timestamptz not null default now()
);
create index if not exists birdspot_sightings_user_idx on public.birdspot_sightings (user_id);
create index if not exists birdspot_sightings_created_idx on public.birdspot_sightings (created_at desc);

alter table public.birdspot_sightings enable row level security;
-- Shared leaderboard game -- every player's sightings are visible to every
-- other player (species + score + when), same as any public leaderboard.
-- Only the owner can create their own rows.
create policy "any authenticated user can read all sightings" on public.birdspot_sightings
  for select using (auth.uid() is not null);
create policy "users create their own sightings" on public.birdspot_sightings
  for insert with check (auth.uid() = user_id);

-- Private bucket -- one folder per user, matches the RLS pattern used
-- elsewhere in this repo's apps (Rutter's storage policies, bokforing's
-- receipts bucket).
insert into storage.buckets (id, name, public)
values ('birdspot-photos', 'birdspot-photos', false)
on conflict (id) do nothing;

create policy "owners read their own bird photos"
  on storage.objects for select
  using (bucket_id = 'birdspot-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "owners upload their own bird photos"
  on storage.objects for insert
  with check (bucket_id = 'birdspot-photos' and auth.uid()::text = (storage.foldername(name))[1]);
-- Sightings are a shared leaderboard, so any authenticated user needs to be
-- able to load OTHER players' photos too, not just their own.
create policy "any authenticated user can view any bird photo"
  on storage.objects for select
  using (bucket_id = 'birdspot-photos' and auth.uid() is not null);

-- Leaderboard: SECURITY DEFINER so it can join auth.users for a display
-- name/email without exposing the whole auth.users table to clients.
-- period: 'all' (all-time total) or 'week' (last 7 days only).
create or replace function public.birdspot_leaderboard(period text default 'all')
returns table(user_id uuid, email text, total_score bigint, sighting_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  return query
  select s.user_id, u.email::text, sum(s.score_awarded)::bigint, count(*)::bigint
  from public.birdspot_sightings s
  join auth.users u on u.id = s.user_id
  where period = 'all' or s.created_at >= now() - interval '7 days'
  group by s.user_id, u.email
  order by sum(s.score_awarded) desc
  limit 10;
end;
$$;
revoke all on function public.birdspot_leaderboard(text) from public;
grant execute on function public.birdspot_leaderboard(text) to authenticated;
