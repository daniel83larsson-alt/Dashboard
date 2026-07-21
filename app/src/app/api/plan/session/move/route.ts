import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { startOfWeek } from '@/lib/dates'

// Separate from /session/update on purpose — that route's status semantics
// (clearing matched_activity_id on anything but 'done') don't apply to a
// pure date move, and mixing the two would make both harder to reason about.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, plannedDate } = await request.json() as { sessionId: string; plannedDate: string }
  if (!sessionId || !plannedDate || !/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) {
    return NextResponse.json({ error: 'Ogiltig förfrågan' }, { status: 400 })
  }

  const { data: session } = await supabase
    .from('plan_sessions')
    .select('id, planned_date')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()
  if (!session) return NextResponse.json({ error: 'Passet hittades inte' }, { status: 404 })

  // A plan only ever covers its own Mon-Sun week — derive that range from
  // the session's current date rather than trusting the client, and reject
  // anything outside it instead of silently letting a session drift into
  // a week it doesn't belong to.
  const weekStart = startOfWeek(new Date(session.planned_date))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const weekEndStr = weekEnd.toISOString().slice(0, 10)

  if (plannedDate < weekStartStr || plannedDate > weekEndStr) {
    return NextResponse.json({ error: 'Datumet ligger utanför den här veckan' }, { status: 400 })
  }

  const { error } = await supabase
    .from('plan_sessions')
    .update({ planned_date: plannedDate })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Plan session move error:', error)
    return NextResponse.json({ error: 'Kunde inte flytta passet' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
