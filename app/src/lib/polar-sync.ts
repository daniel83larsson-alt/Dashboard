import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPolarExercises, polarExerciseToRow } from './polar'
import { autoCleanupDuplicates } from './duplicates-cleanup'

export class PolarNotConnectedError extends Error {
  constructor() { super('Polar not connected') }
}

// Core per-user Polar sync. Polar tokens don't expire (no refresh dance
// needed, unlike Concept2/Strava) — the transaction open→fetch→commit cycle
// itself IS the "what's new since last time" mechanism, so there's no
// separate "since" timestamp to compute the way Concept2/Strava need.
export async function syncPolarForUser(supabase: SupabaseClient, userId: string) {
  const { data: tokenRow } = await supabase
    .from('polar_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tokenRow) throw new PolarNotConnectedError()

  const exercises = await fetchPolarExercises(tokenRow.access_token, tokenRow.polar_user_id)

  if (exercises.length > 0) {
    const rows = exercises.map(e => polarExerciseToRow(e, userId))
    await supabase.from('activities').upsert(rows, { onConflict: 'user_id,strava_id' })
  }

  const cleaned = await autoCleanupDuplicates(supabase, userId)

  return { synced: exercises.length, cleaned }
}
