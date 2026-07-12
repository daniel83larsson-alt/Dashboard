import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { decrypt } from '@/lib/encrypt'

// One-time remediation: connected_accounts (the duplicate-connection guard)
// was added after some users had already connected Garmin/Concept2, so
// their connections were never registered in it — meaning the system had
// no record their login was already taken, and a different account could
// silently reuse it. This registers every EXISTING, already-verified
// connection retroactively. Never returns or logs the decrypted
// credentials themselves, only the fact that a row was backfilled.
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Array<{ userId: string; provider: string; ok: boolean; error?: string }> = []

  const { data: garminRows } = await supabase
    .from('coach_sessions')
    .select('user_id, messages')
    .eq('coach_id', 'garmin_credentials')

  for (const row of garminRows ?? []) {
    try {
      const stored = (row.messages as Array<{ role: string; content: string }>)[0]?.content
      const plain = stored.length > 100 && !stored.startsWith('{') ? decrypt(stored) : stored
      const { email } = JSON.parse(plain) as { email: string }
      const { error } = await supabase.rpc('admin_backfill_connected_account', {
        target_user_id: row.user_id,
        p_provider: 'garmin',
        p_external_id: email.trim(),
      })
      results.push({ userId: row.user_id, provider: 'garmin', ok: !error, error: error?.message })
    } catch (err) {
      results.push({ userId: row.user_id, provider: 'garmin', ok: false, error: err instanceof Error ? err.message : 'decrypt_failed' })
    }
  }

  const { data: c2Rows } = await supabase
    .from('concept2_tokens')
    .select('user_id, concept2_user_id')

  for (const row of c2Rows ?? []) {
    const { error } = await supabase.rpc('admin_backfill_connected_account', {
      target_user_id: row.user_id,
      p_provider: 'concept2',
      p_external_id: String(row.concept2_user_id),
    })
    results.push({ userId: row.user_id, provider: 'concept2', ok: !error, error: error?.message })
  }

  return NextResponse.json({ backfilled: results.length, ok: results.filter(r => r.ok).length, results })
}
