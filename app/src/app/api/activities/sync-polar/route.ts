import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { syncPolarForUser, PolarNotConnectedError } from '@/lib/polar-sync'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    logApiCall(supabase, user.id, 'polar_sync')

    const result = await syncPolarForUser(supabase, user.id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof PolarNotConnectedError) {
      return NextResponse.json({ error: 'Polar not connected' }, { status: 400 })
    }
    console.error('Polar sync error:', err)
    return NextResponse.json({ error: 'Polar sync failed' }, { status: 500 })
  }
}
