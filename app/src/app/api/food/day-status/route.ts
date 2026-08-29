import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { stockholmDateKey } from '@/lib/dates'

type Body = { date: string }

// Manual override for "this day counts" — either confirming a genuinely
// empty day ("I ate nothing") or overriding a flag ("count it anyway"
// despite a missing tracked meal). Only 'complete' exists as a status —
// there's nothing to explicitly mark "incomplete", that's just the absence
// of a row here (see kost.ts's computeDayCompleteness).
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as Body
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ error: 'Ogiltigt datum' }, { status: 400 })
  if (body.date > stockholmDateKey()) return NextResponse.json({ error: 'Kan inte markera en framtida dag' }, { status: 400 })

  const { error } = await supabase.from('kost_day_status').upsert(
    { user_id: user.id, date: body.date, status: 'complete' },
    { onConflict: 'user_id,date' }
  )

  if (error) {
    console.error('Day status upsert error:', error)
    return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
