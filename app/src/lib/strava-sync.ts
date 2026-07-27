import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchStravaActivities, refreshStravaToken, stravaActivityToRow } from './strava'
import { autoCleanupDuplicates } from './duplicates-cleanup'

export class StravaNotConnectedError extends Error {
  constructor() { super('Strava not connected') }
}

// Core per-user Strava sync — used both by the session-authenticated route
// and the cron job, same shape as syncConcept2ForUser.
export async function syncStravaForUser(supabase: SupabaseClient, userId: string) {
  const { data: tokenRow } = await supabase
    .from('strava_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tokenRow) throw new StravaNotConnectedError()

  let accessToken = tokenRow.access_token
  const now = Math.floor(Date.now() / 1000)

  if (tokenRow.expires_at < now + 60) {
    const refreshed = await refreshStravaToken(tokenRow.refresh_token)
    accessToken = refreshed.access_token
    await supabase.from('strava_tokens').update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
  }

  const { data: latest } = await supabase
    .from('activities')
    .select('start_date')
    .eq('user_id', userId)
    .eq('source', 'strava')
    .order('start_date', { ascending: false })
    .limit(1)
    .single()

  // Strava's `after` is unix epoch seconds — a day of slack so a slightly
  // late-arriving activity from right around the last sync isn't missed.
  const after = latest?.start_date
    ? Math.floor(new Date(latest.start_date).getTime() / 1000) - 86400
    : undefined

  const activities = await fetchStravaActivities(accessToken, after)

  if (activities.length > 0) {
    const rows = activities.map(a => stravaActivityToRow(a, userId))
    await supabase.from('activities').upsert(rows, { onConflict: 'user_id,strava_id' })
  }

  const cleaned = await autoCleanupDuplicates(supabase, userId)

  return { synced: activities.length, cleaned }
}
