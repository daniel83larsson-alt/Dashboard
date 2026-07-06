# Fågelspotting (POC)

PWA where a logged-in user photographs a bird, gets it identified by
iNaturalist's free Computer Vision API, is awarded a rarity score (1-20),
and climbs a shared leaderboard (all-time + last 7 days).

## Stack

Next.js 16, Supabase (auth + Postgres + Storage), server-side-only AI call
(`app/api/identify/route.ts`), Tailwind v4. This POC shares the `bokforing`
Supabase project (Daniel's org is capped at 2 free projects, both already in
use) via `birdspot_`-prefixed tables -- fully isolated from bokforing's own
data.

## Local setup

```
cp .env.local.example .env.local   # fill in your Supabase project's values
npm install
npm run dev
```

Run `supabase/schema.sql` once in the Supabase SQL editor before first use.

## Tests

```
BIRDSPOT_MOCK_AI=1 npx playwright test
```

The suite mocks only the iNaturalist network call (deterministic species,
see `lib/inaturalist.ts`) -- everything else (rarity lookup, photo upload,
DB insert, leaderboard aggregation) runs for real against the test project,
and cleans up every throwaway user + photo it creates afterward.

## Known limitation (v1, documented not solved)

If iNaturalist identifies a species missing from `birdspot_species_rarity`,
the sighting is still saved with a neutral default score of 5 rather than
blocking the flow. The seed table currently covers ~44 Swedish birds.
