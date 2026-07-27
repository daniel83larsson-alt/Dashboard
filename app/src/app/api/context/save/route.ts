import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { context } = await request.json()
    if (typeof context !== 'string') return NextResponse.json({ error: 'Ogiltigt format' }, { status: 400 })

    // Limit length to prevent oversized prompts and prompt-injection attempts
    const sanitized = context.slice(0, 2000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: 'user_context',
      messages: [{ role: 'system', content: sanitized }],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Context save error:', err)
    return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
  }
}
