import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getGarminClient, withGarminLock } from '@/lib/garmin'
import { decryptMaybeLegacy } from '@/lib/encrypt'

// TEMPORARY diagnostic — investigating Daniel's "wellness shows one day too
// far back" report. Calls Garmin's raw sleep endpoint for two explicit
// dates and returns the raw calendarDate/timestamps so we can see exactly
// which calendar date Garmin attributes a given night's sleep to, instead
// of guessing from our own derived data. Remove after use.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { targetUserId, dates } = await request.json()
  if (!targetUserId || !Array.isArray(dates)) return NextResponse.json({ error: 'targetUserId/dates saknas' }, { status: 400 })

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
    const results = await withGarminLock(async () => {
      const gc = await getGarminClient(email, password)
      const out: Record<string, unknown> = {}
      for (const dateStr of dates as string[]) {
        const d = new Date(dateStr + 'T12:00:00Z')
        const data = await gc.getSleepData(d)
        const dto = data?.dailySleepDTO as unknown as Record<string, unknown> | undefined
        out[dateStr] = {
          requestedDate: dateStr,
          responseCalendarDate: dto?.calendarDate ?? null,
          sleepStartTimestampGMT: dto?.sleepStartTimestampGMT ?? null,
          sleepEndTimestampGMT: dto?.sleepEndTimestampGMT ?? null,
          sleepTimeSeconds: dto?.sleepTimeSeconds ?? null,
        }
      }
      return out
    })
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, reason: 'error', message: msg })
  }
}
