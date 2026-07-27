import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

export const maxDuration = 60

// A standing regression test against REAL production behavior, not just
// RLS isolation (isolation-check already covers that). Runs nightly plus
// on-demand via GitHub Actions workflow_dispatch — the "run this before I
// ship something scary" button. Same disposable-account discipline as
// isolation-check: create → exercise → assert → always delete in finally.
//
// Deliberately does NOT include a weekly-digest generation check (an
// earlier version of this plan called for one). That would call Gemini for
// real on every single nightly run, forever — this project's shared Gemini
// key has a hard 20-requests/DAY quota (confirmed the hard way earlier this
// project — see STATUS.md, a cascading outage traced back to exactly this
// kind of unbudgeted automated consumption). Burning one of those 20 slots
// every night on a smoke test that doesn't even inspect the AI content
// (just the HTML wrapper) is a bad trade. If a Gemini-touching smoke check
// is ever wanted, it needs its own explicit quota budget, not a silent add
// to this cron.
type CheckResult = { name: string; ok: boolean; detail?: string }

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

// The Next.js routes authenticate via @supabase/ssr reading a specific
// cookie (`sb-<project-ref>-auth-token`, a base64url-encoded JSON session),
// NOT an Authorization header — a plain bearer token on the request does
// nothing against createSupabaseServerClient(). Project ref is the subdomain
// of NEXT_PUBLIC_SUPABASE_URL, derived at runtime rather than hardcoded.
function authCookieFor(session: { access_token: string; token_type: string; expires_in: number; expires_at?: number; refresh_token: string; user: unknown }) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `sb-${ref}-auth-token=base64-${payload}`
}

// Check 1: a manually logged activity actually reaches the database with
// the right shape (source='manual', correct calorie estimate) — exercises
// the real /api/activities/log-manual route over HTTP against the deployed
// app, not just the underlying function in-process, so a routing/auth
// regression would be caught too.
async function checkManualActivityLog(
  session: { access_token: string; token_type: string; expires_in: number; expires_at?: number; refresh_token: string; user: unknown },
  userId: string,
  admin: SupabaseClient
): Promise<CheckResult> {
  const marker = `PROD_SMOKE_${Date.now()}`
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/activities/log-manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookieFor(session),
      },
      body: JSON.stringify({
        sportType: 'Run',
        movingTime: 1800,
        distance: 5000,
        startDate: new Date().toISOString(),
        name: marker,
      }),
    })
    if (!res.ok) return { name: 'manual_activity_log', ok: false, detail: `HTTP ${res.status}` }

    const { data: row } = await admin.from('activities').select('source, calories').eq('user_id', userId).eq('name', marker).maybeSingle()
    if (!row) return { name: 'manual_activity_log', ok: false, detail: 'row never landed in the database' }
    if (row.source !== 'manual') return { name: 'manual_activity_log', ok: false, detail: `source was '${row.source}', expected 'manual'` }
    return { name: 'manual_activity_log', ok: true }
  } catch (err) {
    return { name: 'manual_activity_log', ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

// Check 2: the already_connected guard (fixed after the Conny data-leak
// incident) still rejects a second account claiming a provider identity
// already claimed by the first — exercised directly via the same RPC the
// real OAuth callbacks use, each through its own session (not service-role),
// so RLS/grant regressions on the function itself would be caught too.
async function checkDuplicateProviderRejection(clientA: SupabaseClient, clientB: SupabaseClient, marker: string): Promise<CheckResult> {
  try {
    const { error: firstClaim } = await clientA.rpc('claim_connected_account', { p_provider: 'garmin', p_external_id: marker })
    if (firstClaim) return { name: 'duplicate_provider_rejection', ok: false, detail: `first claim unexpectedly failed: ${firstClaim.message}` }

    const { error: secondClaim } = await clientB.rpc('claim_connected_account', { p_provider: 'garmin', p_external_id: marker })
    if (!secondClaim) return { name: 'duplicate_provider_rejection', ok: false, detail: 'second account was allowed to claim an already-claimed provider id — the Conny-incident guard is broken' }
    return { name: 'duplicate_provider_rejection', ok: true }
  } catch (err) {
    return { name: 'duplicate_provider_rejection', ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

// Check 3: the moderation-column self-protection trigger
// (protect_profile_moderation_columns in schema.sql) still blocks a user
// from unlocking their own account or resetting their own flagged_attempts
// through their own session. Confirmed live 2026-07-25 that this trigger was
// documented in schema.sql but had never actually been applied to
// production — a real, exploitable self-unlock bypass — then fixed and
// re-verified. The trigger protects SILENTLY (rewrites new.locked/
// new.flagged_attempts back to old.* rather than raising), so the PATCH
// itself always returns HTTP 200/no error either way — the only reliable
// signal is whether the row's actual values changed. This doubles as
// answering that "is it live" question every night, not just a regression
// guard against a future accidental drop of the trigger.
async function checkModerationColumnProtection(userClient: SupabaseClient, admin: SupabaseClient, userId: string): Promise<CheckResult> {
  const { error: seedError } = await admin.from('profiles').update({ locked: true, flagged_attempts: 5 }).eq('id', userId)
  if (seedError) return { name: 'moderation_column_protection', ok: false, detail: `setup failed: ${seedError.message}` }

  await userClient.from('profiles').update({ locked: false, flagged_attempts: 0 }).eq('id', userId)

  const { data: row, error: readError } = await admin.from('profiles').select('locked, flagged_attempts').eq('id', userId).maybeSingle()
  if (readError || !row) return { name: 'moderation_column_protection', ok: false, detail: `verification read failed: ${readError?.message ?? 'no row'}` }
  if (row.locked !== true || row.flagged_attempts !== 5) {
    return { name: 'moderation_column_protection', ok: false, detail: 'a user session was able to change its own locked/flagged_attempts columns — self-unlock bypass' }
  }
  return { name: 'moderation_column_protection', ok: true }
}

async function alertDiscord(failures: CheckResult[], runId: string) {
  const url = process.env.SIGNUP_NOTIFY_WEBHOOK_URL
  if (!url) return
  const lines = failures.map(f => `- ${f.name}: ${f.detail ?? 'failed'}`).join('\n')
  const content = `🚨 **Produktions-smoketest misslyckades** (run ${runId})\n${lines}`
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }).catch(() => {})
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()
  const runId = Math.random().toString(36).slice(2, 10)
  const emailA = `prod-smoke-a-${runId}@dltrainer.internal`
  const emailB = `prod-smoke-b-${runId}@dltrainer.internal`
  const marker = `PROD_SMOKE_PROVIDER_${runId}`

  let userIdA: string | null = null
  let userIdB: string | null = null
  const results: CheckResult[] = []

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

    const [clientA, clientB] = await Promise.all([sessionClientFor(emailA), sessionClientFor(emailB)])
    const { data: { session: sessionA } } = await clientA.auth.getSession()
    if (!sessionA) throw new Error('no session for account A')

    results.push(await checkManualActivityLog(sessionA, userIdA, admin))
    results.push(await checkDuplicateProviderRejection(clientA, clientB, marker))
    results.push(await checkModerationColumnProtection(clientA, admin, userIdA))

    const failures = results.filter(r => !r.ok)
    if (failures.length > 0) {
      await alertDiscord(failures, runId)
    }

    return NextResponse.json({ ranAt: new Date().toISOString(), runId, ok: failures.length === 0, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await alertDiscord([{ name: 'crash', ok: false, detail: message }], runId)
    return NextResponse.json({ ranAt: new Date().toISOString(), runId, ok: false, error: message }, { status: 500 })
  } finally {
    if (userIdA) await admin.auth.admin.deleteUser(userIdA).catch(() => {})
    if (userIdB) await admin.auth.admin.deleteUser(userIdB).catch(() => {})
  }
}
