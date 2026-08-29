import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { syncYazioForUser, YazioNotConfiguredError } from '@/lib/yazio-sync'

// Admin-only: runs a REAL YAZIO sync for a specific user on demand (not
// just a credential test) — same syncYazioForUser() the nightly cron
// calls, just for one user right now instead of everyone overnight. Uses
// the service-role client (bypasses RLS, same as the cron route) so the
// admin never needs to see or handle the user's password themselves.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { targetUserId } = await request.json()
  if (!targetUserId) return NextResponse.json({ error: 'targetUserId saknas' }, { status: 400 })

  try {
    const admin = createSupabaseAdminClient()
    const result = await syncYazioForUser(admin, targetUserId)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof YazioNotConfiguredError) {
      return NextResponse.json({ ok: false, reason: 'not_configured' })
    }
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, reason: 'sync_failed', message: msg })
  }
}
