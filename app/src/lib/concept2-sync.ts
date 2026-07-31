import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchConcept2Results, refreshConcept2Token, concept2ResultToActivity } from './concept2'
import { autoCleanupDuplicates } from './duplicates-cleanup'

export class Concept2NotConnectedError extends Error {
  constructor() { super('Concept2 not connected') }
}

// Core per-user Concept2 sync — used both by the session-authenticated
// route and the cron job. Takes the user id explicitly since the cron
// caller has no session to pull it from.
export async function syncConcept2ForUser(supabase: SupabaseClient, userId: string) {
  const { data: tokenRow } = await supabase
    .from('concept2_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tokenRow) throw new Concept2NotConnectedError()

  let accessToken = tokenRow.access_token
  const now = Math.floor(Date.now() / 1000)

  // Personal tokens never expire (expires_at = 9999999999); skip refresh for those
  if (tokenRow.refresh_token !== 'personal_token' && tokenRow.expires_at < now + 60) {
    const refreshed = await refreshConcept2Token(tokenRow.refresh_token)
    accessToken = refreshed.access_token
    await supabase.from('concept2_tokens').update({
      access_token: refreshed.access_token,
      expires_at: now + refreshed.expires_in,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
  }

  const { data: latest } = await supabase
    .from('activities')
    .select('start_date')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(1)
    .single()

  const updatedAfter = latest?.start_date
    ? new Date(new Date(latest.start_date).getTime() - 86400000).toISOString().split('T')[0]
    : undefined

  const results = await fetchConcept2Results(accessToken, tokenRow.concept2_user_id, updatedAfter)

  if (results.length > 0) {
    const rows = results.map(r => concept2ResultToActivity(r, userId))
    // Checked, not swallowed — an unchecked upsert here silently reported
    // sync as successful even when zero rows actually landed (found via a
    // real failure in the equivalent Garmin path; same unchecked pattern
    // existed in every sync source, fixed everywhere at once).
    const { error: upsertError } = await supabase.from('activities').upsert(rows, { onConflict: 'user_id,strava_id' })
    if (upsertError) throw new Error(`Concept2 activity upsert failed: ${upsertError.message}`)
  }

  const cleaned = await autoCleanupDuplicates(supabase, userId)

  return { synced: results.length, cleaned }
}
