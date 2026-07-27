import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { encrypt } from '@/lib/encrypt'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'

// Own LLM API keys used to be written straight from the client with no
// encryption despite the column name implying it — moved server-side so we
// can actually encrypt at rest, matching how Garmin credentials are handled.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

    const { apiKey } = await request.json()
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json({ error: 'API-nyckel saknas' }, { status: 400 })
    }

    await supabase.from('profiles').update({
      llm_api_key_encrypted: encrypt(apiKey.trim()),
    }).eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Save LLM key error:', err)
    return NextResponse.json({ error: 'Kunde inte spara nyckeln' }, { status: 500 })
  }
}
