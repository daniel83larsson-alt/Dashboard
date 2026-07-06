// Hand-written types matching supabase/schema.sql, same pattern as the
// other apps in this repo.

export interface SpeciesRarity {
  id: number;
  common_name: string;
  scientific_name: string;
  rarity_score: number;
}

export interface Sighting {
  id: string;
  user_id: string;
  species_rarity_id: number | null;
  species_name: string;
  photo_url: string;
  score_awarded: number;
  created_at: string;
}

export interface LeaderboardRow {
  user_id: string;
  email: string;
  total_score: number;
  sighting_count: number;
}

// Minimal Database shape so @supabase/ssr's generic client typing compiles.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
