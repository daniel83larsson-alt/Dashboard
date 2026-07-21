import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { checkAndConsumeRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import { generateWeeklyDigestForUser } from '@/lib/weekly-digest-generate'

// Interactive "generate now" trigger — used by the Veckoplan page's recap
// card when no digest has been generated yet, and by manual re-generation.
// Distinct from the Sunday cron (step 4), which calls
// generateWeeklyDigestForUser directly with an admin client and does NOT
// go through this route or its rate limit — see weekly-digest-generate.ts.
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })
    logApiCall(supabase, user.id, 'weekly_digest_generate')

    const { data: profile } = await supabase.from('profiles').select('llm_api_key_encrypted').eq('id', user.id).single()
    if (!profile?.llm_api_key_encrypted) {
      const rate = await checkAndConsumeRateLimit(supabase, user.id)
      if (!rate.allowed) return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 })
    }

    const record = await generateWeeklyDigestForUser(supabase, user.id)
    return NextResponse.json({ ok: true, digest: record })
  } catch (err) {
    console.error('Weekly digest generate error:', err)
    return NextResponse.json({ error: 'Kunde inte skapa veckans recap' }, { status: 500 })
  }
}
