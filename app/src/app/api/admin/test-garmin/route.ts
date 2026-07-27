import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { fetchGarminActivities, withGarminLock } from '@/lib/garmin'
import { decryptMaybeLegacy } from '@/lib/encrypt'

// Admin-only diagnostic: verifies that a SPECIFIC user's stored Garmin
// credentials still work and can actually fetch activities, without the
// admin ever seeing the password. Read-only against Garmin and against our
// own DB — nothing is written, this only reports what it found.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { targetUserId } = await request.json()
  if (!targetUserId) return NextResponse.json({ error: 'targetUserId saknas' }, { status: 400 })

  const { data: storedCreds, error: rpcError } = await supabase.rpc('admin_get_garmin_credentials', {
    target_user_id: targetUserId,
  })
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })
  if (!storedCreds) return NextResponse.json({ ok: false, reason: 'not_configured' })

  let email: string | undefined
  let password: string | undefined
  try {
    const parsed = JSON.parse(decryptMaybeLegacy(storedCreds))
    email = parsed.email
    password = parsed.password
  } catch {
    return NextResponse.json({ ok: false, reason: 'corrupt_credentials' })
  }
  if (!email || !password) return NextResponse.json({ ok: false, reason: 'not_configured' })

  try {
    const activities = await withGarminLock(() => fetchGarminActivities(25, email, password))
    const preview = activities.slice(0, 5).map(a => ({
      name: a.activityName,
      type: a.activityType?.typeKey ?? null,
      startTimeLocal: a.startTimeLocal,
    }))
    return NextResponse.json({ ok: true, count: activities.length, preview })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, reason: 'login_failed', message: msg })
  }
}
