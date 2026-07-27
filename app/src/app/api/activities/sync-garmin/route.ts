import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { syncGarminForUser, GarminNotConfiguredError } from '@/lib/garmin-sync'
import { withGarminLock } from '@/lib/garmin'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    logApiCall(supabase, user.id, 'garmin_sync')

    // withGarminLock — see lib/garmin.ts — temporarily serializes all Garmin
    // HTTP work process-wide to close a cross-user token-leak race in the
    // vendored library (STATUS.md "Teknisk skuld").
    const result = await withGarminLock(() => syncGarminForUser(supabase, user.id, user.email))
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof GarminNotConfiguredError) {
      return NextResponse.json({ error: 'Garmin not configured' }, { status: 400 })
    }
    console.error('Garmin sync error:', err)
    return NextResponse.json({ error: 'Garmin sync failed' }, { status: 500 })
  }
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ configured: true })
}
