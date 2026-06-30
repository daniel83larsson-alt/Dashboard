import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { GarminConnect } from 'garmin-connect'
import { encrypt } from '@/lib/encrypt'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { email, password } = await request.json()
    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'E-post och lösenord krävs' }, { status: 400 })
    }

    // Verify credentials work before saving
    const gc = new GarminConnect({ username: email.trim(), password: password.trim() })
    await gc.login()

    // Store encrypted — never save plaintext credentials
    const stored = encrypt(JSON.stringify({ email: email.trim(), password: password.trim() }))

    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: 'garmin_credentials',
      messages: [{ role: 'system', content: stored }],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('credentials') || msg.includes('login') || msg.includes('401') || msg.includes('auth')) {
      return NextResponse.json({ error: 'Fel e-post eller lösenord' }, { status: 401 })
    }
    console.error('Garmin credential save error:', err)
    return NextResponse.json({ error: 'Kunde inte ansluta till Garmin' }, { status: 500 })
  }
}
