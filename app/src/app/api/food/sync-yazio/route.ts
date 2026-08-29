import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { syncYazioForUser, YazioNotConfiguredError } from '@/lib/yazio-sync'

// First-pass sync route — returns the raw fetched YAZIO payload directly in
// the response (visible in the browser's network tab) rather than only
// writing it to the database, specifically so the real data shape can be
// inspected right after connecting, before any decision is made about how
// to fold it into food_log.
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    logApiCall(supabase, user.id, 'yazio_sync')

    const result = await syncYazioForUser(supabase, user.id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof YazioNotConfiguredError) {
      return NextResponse.json({ error: 'YAZIO not configured' }, { status: 400 })
    }
    console.error('YAZIO sync error:', err)
    return NextResponse.json({ error: 'YAZIO sync failed' }, { status: 500 })
  }
}
