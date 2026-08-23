import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { verifyYazioCredentials } from '@/lib/yazio'
import { encrypt } from '@/lib/encrypt'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

    const { email, password } = await request.json()
    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'E-post och lösenord krävs' }, { status: 400 })
    }
    const normalizedEmail = email.trim().toLowerCase()

    // Verify credentials work before saving
    await verifyYazioCredentials(email.trim(), password.trim())

    // Same protection as Garmin/Concept2/Strava — refuse to link a YAZIO
    // account that's already claimed by another DL Trainer profile.
    const { error: claimError } = await supabase.rpc('claim_connected_account', {
      p_provider: 'yazio',
      p_external_id: normalizedEmail,
    })
    if (claimError) {
      return NextResponse.json(
        { error: 'Det här YAZIO-kontot är redan anslutet till en annan DL Trainer-profil. Varje person behöver sitt eget YAZIO-konto.' },
        { status: 409 }
      )
    }

    // Store encrypted — never save plaintext credentials
    const stored = encrypt(JSON.stringify({ email: email.trim(), password: password.trim() }))

    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: 'yazio_credentials',
      messages: [{ role: 'system', content: stored }],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    console.error('YAZIO credential save error:', err)
    if (msg.includes('401') || msg.includes('Incomplete or missing credentials')) {
      return NextResponse.json({ error: 'Fel e-post eller lösenord' }, { status: 401 })
    }
    // Anything else (network errors, YAZIO changing their unofficial API,
    // a validation failure in the library's own schema, ...) — surface the
    // raw message instead of a generic dead-end. It never contains the
    // password (the library's errors are plain "status statusText"
    // strings, confirmed by reading its source).
    return NextResponse.json(
      { error: msg ? `Kunde inte ansluta till YAZIO (${msg})` : 'Kunde inte ansluta till YAZIO' },
      { status: 500 }
    )
  }
}
