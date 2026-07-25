import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { findDuplicateGroups, suggestKeepId, rowSource } from '@/lib/duplicates'

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: activities } = await supabase
      .from('activities')
      .select('id, strava_id, source, start_date, distance, moving_time, sport_type, name, average_heartrate, description, created_at')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false })

    // A clean 1-Garmin + 1-Concept2 pair is now merged for display and
    // stats (Passlogg, dashboard totals) instead of being a delete-one
    // choice — only flag groups that AREN'T that (same-source double-syncs,
    // 3+-way ties), where deletion is still the right call.
    const groups = findDuplicateGroups(activities ?? []).filter(group => {
      const garmin = group.filter(a => rowSource(a) === 'garmin')
      const concept2 = group.filter(a => rowSource(a) === 'concept2')
      return !(garmin.length === 1 && concept2.length === 1)
    })
    const result = groups.map(group => ({ activities: group, suggestedKeepId: suggestKeepId(group) }))

    return NextResponse.json({ groups: result })
  } catch (err) {
    console.error('Duplicate scan error:', err)
    return NextResponse.json({ error: 'Kunde inte söka dubbletter' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { ids } = await request.json()
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string') || ids.length === 0) {
      return NextResponse.json({ error: 'Ogiltigt format' }, { status: 400 })
    }

    const { error, count } = await supabase
      .from('activities')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .in('id', ids)

    if (error) throw error

    return NextResponse.json({ deleted: count ?? 0 })
  } catch (err) {
    console.error('Duplicate delete error:', err)
    return NextResponse.json({ error: 'Kunde inte ta bort' }, { status: 500 })
  }
}
