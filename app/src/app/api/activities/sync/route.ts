import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { fetchConcept2Results, refreshConcept2Token, concept2ResultToActivity } from '@/lib/concept2'
import { autoCleanupDuplicates } from '@/lib/duplicates-cleanup'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Daniel asked to stop syncing his own passes (2026-07-04) — the admin
    // account is excluded from sync entirely, everyone else unaffected.
    if (process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL) {
      return NextResponse.json({ synced: 0, paused: true })
    }

    const { data: tokenRow } = await supabase
      .from('concept2_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!tokenRow) {
      return NextResponse.json({ error: 'Concept2 not connected' }, { status: 400 })
    }

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
      }).eq('user_id', user.id)
    }

    const { data: latest } = await supabase
      .from('activities')
      .select('start_date')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false })
      .limit(1)
      .single()

    const updatedAfter = latest?.start_date
      ? new Date(new Date(latest.start_date).getTime() - 86400000).toISOString().split('T')[0]
      : undefined

    const results = await fetchConcept2Results(
      accessToken,
      tokenRow.concept2_user_id,
      updatedAfter
    )

    if (results.length > 0) {
      const rows = results.map(r => concept2ResultToActivity(r, user.id))
      await supabase.from('activities').upsert(rows, { onConflict: 'user_id,strava_id' })
    }

    const cleaned = await autoCleanupDuplicates(supabase, user.id)

    return NextResponse.json({ synced: results.length, cleaned })
  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
