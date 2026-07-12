import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

export const maxDuration = 60

// Runs daily (see vercel.json) as a standing regression test for the exact
// failure class that leaked Daniel's Garmin data onto Conny's account: two
// disposable test users are created, each seeded with a unique marker in
// every table an earlier incident actually touched, then each user's OWN
// session (not the service-role client) queries those tables. If either
// user's session can see the other's marker, RLS has regressed — alert via
// the same Discord webhook already used for signup notifications, never
// auto-fix. Both test accounts are always deleted before returning,
// success or failure, so nothing synthetic lingers in production data.
const TABLES = ['profiles', 'activities', 'connected_accounts', 'coach_sessions'] as const

type Violation = { table: string; queriedBy: 'A' | 'B'; foundForeignMarker: string }

async function sessionClientFor(email: string) {
  const admin = createSupabaseAdminClient()
  const { data: linkData, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !linkData?.properties?.hashed_token) throw new Error(`generateLink failed for ${email}: ${error?.message}`)

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
    type: 'email',
    token_hash: linkData.properties.hashed_token,
  })
  if (otpError || !otpData.session) throw new Error(`verifyOtp failed for ${email}: ${otpError?.message}`)

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${otpData.session.access_token}` } },
  })
}

async function seedMarkers(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string, marker: string) {
  await admin.from('profiles').update({ name: marker }).eq('id', userId)
  await admin.from('activities').insert({
    user_id: userId,
    strava_id: Date.now() + Math.floor(Math.random() * 100000),
    sport_type: 'Run',
    name: marker,
    start_date: new Date().toISOString(),
  })
  await admin.from('connected_accounts').insert({ provider: 'garmin', external_id: `${marker}@isolation-check.internal`, user_id: userId })
  await admin.from('coach_sessions').insert({ user_id: userId, coach_id: 'isolation_test', messages: [{ role: 'system', content: marker }] })
}

async function checkTable(
  client: SupabaseClient,
  table: (typeof TABLES)[number],
  queriedBy: 'A' | 'B',
  ownUserId: string,
  foreignMarker: string,
): Promise<Violation[]> {
  const { data } = await client.from(table).select('*')
  const violations: Violation[] = []
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const rowUserId = table === 'profiles' ? row.id : row.user_id
    const serialized = JSON.stringify(row)
    if (rowUserId !== ownUserId || serialized.includes(foreignMarker)) {
      violations.push({ table, queriedBy, foundForeignMarker: foreignMarker })
      break
    }
  }
  return violations
}

async function alertDiscord(violations: Violation[], runId: string) {
  const url = process.env.SIGNUP_NOTIFY_WEBHOOK_URL
  if (!url) return
  const lines = violations.map(v => `- ${v.table} (seglat via användare ${v.queriedBy}s session)`).join('\n')
  const content = `🚨 **Dataisolerings-kontroll misslyckades** (run ${runId})\nEn testanvändare kunde se en annan testanvändares data i:\n${lines}\n\nDetta är samma klass av fel som Conny-incidenten — kolla RLS-policyer omedelbart.`
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }).catch(() => {})
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()
  const runId = Math.random().toString(36).slice(2, 10)
  const emailA = `isolation-check-a-${runId}@dltrainer.internal`
  const emailB = `isolation-check-b-${runId}@dltrainer.internal`
  const markerA = `ISOLATION_MARKER_A_${runId}`
  const markerB = `ISOLATION_MARKER_B_${runId}`

  let userIdA: string | null = null
  let userIdB: string | null = null
  const violations: Violation[] = []

  try {
    const [{ data: createdA, error: errA }, { data: createdB, error: errB }] = await Promise.all([
      admin.auth.admin.createUser({ email: emailA, email_confirm: true }),
      admin.auth.admin.createUser({ email: emailB, email_confirm: true }),
    ])
    if (errA || !createdA?.user || errB || !createdB?.user) {
      throw new Error(`Test account creation failed: ${errA?.message ?? ''} ${errB?.message ?? ''}`)
    }
    userIdA = createdA.user.id
    userIdB = createdB.user.id

    await Promise.all([seedMarkers(admin, userIdA, markerA), seedMarkers(admin, userIdB, markerB)])

    const [clientA, clientB] = await Promise.all([sessionClientFor(emailA), sessionClientFor(emailB)])

    for (const table of TABLES) {
      violations.push(...(await checkTable(clientA, table, 'A', userIdA, markerB)))
      violations.push(...(await checkTable(clientB, table, 'B', userIdB, markerA)))
    }

    if (violations.length > 0) {
      await alertDiscord(violations, runId)
    }

    return NextResponse.json({ ranAt: new Date().toISOString(), runId, ok: violations.length === 0, violations, checkedTables: TABLES })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await alertDiscord([{ table: 'n/a', queriedBy: 'A', foundForeignMarker: `check crashed: ${message}` }], runId)
    return NextResponse.json({ ranAt: new Date().toISOString(), runId, ok: false, error: message }, { status: 500 })
  } finally {
    // Always clean up the disposable accounts, whether the check passed,
    // failed, or crashed — cascade deletes their profiles/activities/
    // connected_accounts/coach_sessions rows automatically (on delete cascade).
    if (userIdA) await admin.auth.admin.deleteUser(userIdA).catch(() => {})
    if (userIdB) await admin.auth.admin.deleteUser(userIdB).catch(() => {})
  }
}
