import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { stockholmDateKey } from '@/lib/dates'

const VALID_TAGS = ['normal', 'sick', 'social', 'travel', 'stress', 'injury', 'other']

type Body = { date: string; tag: string | null; note: string | null }

// Daniel's idé #4 — a short "why" per day (sick, travel, stressful, …),
// shown back in the check-in narrative as context rather than an excuse.
// Row absence means "unanswered", same stance kost_day_status already
// takes — an empty tag+note pair here just deletes the row instead of
// leaving a hollow one behind.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as Body
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ error: 'Ogiltigt datum' }, { status: 400 })
  if (body.date > stockholmDateKey()) return NextResponse.json({ error: 'Kan inte notera en framtida dag' }, { status: 400 })
  if (body.tag != null && !VALID_TAGS.includes(body.tag)) return NextResponse.json({ error: 'Ogiltig tagg' }, { status: 400 })

  const note = body.note?.trim() || null
  if (body.tag == null && note == null) {
    await supabase.from('day_context_notes').delete().eq('user_id', user.id).eq('date', body.date)
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase.from('day_context_notes').upsert(
    { user_id: user.id, date: body.date, tag: body.tag, note, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,date' }
  )

  if (error) {
    console.error('Day context note upsert error:', error)
    return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
