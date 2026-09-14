import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import { refreezeDeficitBudget, type RefreezeReason } from '@/lib/deficit-budget-refreeze'

// The only reasons a client is ever allowed to trigger directly — the rest
// (checkin_applied, milestone_expired/reached, stale_refresh) are only ever
// invoked from server-side code (checkin/apply, the cron sweep), never a
// fetch from the browser. 'settings_changed' stays allowed for backward
// compatibility even though ProfileForm no longer sends it (Daniel's
// trigger-schedule addendum: ordinary Profil saves now wait for Sunday's
// scheduled recompute instead of firing immediately).
const CLIENT_TRIGGERABLE_REASONS: RefreezeReason[] = [
  'settings_changed', 'milestone_set', 'milestone_cancelled', 'override_acknowledged', 'override_voided',
]

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const reason = body?.reason as string | undefined

  // 'manual_test' is the admin-only "Räkna om nu (test)" button on Profil —
  // gated separately from the normal allowlist so it can never be reached
  // by an ordinary account, accidentally or otherwise.
  const isAdmin = !!process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  if (reason === 'manual_test') {
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  } else if (!reason || !CLIENT_TRIGGERABLE_REASONS.includes(reason as RefreezeReason)) {
    return NextResponse.json({ error: 'Ogiltig anledning' }, { status: 400 })
  }

  const result = await refreezeDeficitBudget(supabase, user.id, reason as RefreezeReason)
  if (!result) return NextResponse.json({ error: 'Inget aktivt viktmål' }, { status: 400 })

  return NextResponse.json(result)
}
