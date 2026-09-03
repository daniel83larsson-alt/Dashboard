import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import { stockholmDateKey } from '@/lib/dates'
import { resolveActiveGoalSegment, computeRollingWeightAverage, deficitOverrideSignature, milestoneRejectedReasonLabel } from '@/lib/deficit'
import { refreezeDeficitBudget } from '@/lib/deficit-budget-refreeze'

type CreateBody = { targetWeightKg?: number; targetDateISO?: string; overrideAcknowledged?: boolean }

// One active delmål at a time (Daniel's call) — the DB's partial unique
// index is the real guarantee, this is just a friendlier error than a
// constraint violation.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

  const body = await request.json().catch(() => null) as CreateBody | null
  const targetWeightKg = body?.targetWeightKg
  const targetDateISO = body?.targetDateISO
  if (typeof targetWeightKg !== 'number' || Number.isNaN(targetWeightKg) || !targetDateISO) {
    return NextResponse.json({ error: 'Ange en giltig målvikt och ett datum' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('deficit_tracking_enabled, deficit_start_weight_kg, deficit_target_weight_kg, deficit_target_date')
    .eq('id', user.id)
    .single()

  if (!profile?.deficit_tracking_enabled || profile.deficit_start_weight_kg == null || profile.deficit_target_weight_kg == null || !profile.deficit_target_date) {
    return NextResponse.json({ error: 'Sätt upp ett övergripande viktmål i Profil först' }, { status: 400 })
  }

  const { data: existingActive } = await supabase
    .from('deficit_milestones')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (existingActive) return NextResponse.json({ error: 'Du har redan ett aktivt delmål — avbryt det först om du vill sätta ett nytt.' }, { status: 400 })

  const todayKey = stockholmDateKey()
  // Validated against the SAME rule the budget-freeze will apply later
  // (resolveActiveGoalSegment) — reject clearly here with a specific
  // reason rather than silently falling back to the overall goal.
  const segment = resolveActiveGoalSegment({
    overall: {
      startWeightKg: profile.deficit_start_weight_kg,
      targetWeightKg: profile.deficit_target_weight_kg,
      targetDateISO: profile.deficit_target_date,
      overrideAcknowledged: false,
    },
    milestone: { targetWeightKg, targetDateISO, overrideAcknowledged: false },
    todayKey,
  })
  if (segment.milestoneExpired) return NextResponse.json({ error: 'Det datumet har redan passerat.' }, { status: 400 })
  if (segment.milestoneRejectedReason) {
    return NextResponse.json({ error: milestoneRejectedReasonLabel(segment.milestoneRejectedReason) }, { status: 400 })
  }

  const { data: weighInRows } = await supabase
    .from('body_measurements')
    .select('measured_on, weight_kg')
    .eq('user_id', user.id).not('weight_kg', 'is', null)
    .order('measured_on', { ascending: false }).limit(30)
  const weighIns = (weighInRows ?? []).map(r => ({ date: r.measured_on as string, weightKg: r.weight_kg as number }))
  // A delmål always starts from where the person IS today, not the frozen
  // overall start weight — same rolling-average source refreezeDeficitBudget
  // uses for an active/just-ended milestone.
  const rolling = computeRollingWeightAverage(weighIns, todayKey, { windowDays: 14, maxReadings: 7, minReadings: 1 })
  const startWeightKg = rolling.avgKg ?? rolling.latestKg ?? profile.deficit_start_weight_kg

  const overrideAcknowledged = body?.overrideAcknowledged === true
  const signature = deficitOverrideSignature({ startWeightKg, targetWeightKg, targetDateISO })

  const { data: milestone, error } = await supabase.from('deficit_milestones').insert({
    user_id: user.id,
    target_weight_kg: targetWeightKg,
    target_date: targetDateISO,
    start_weight_kg: startWeightKg,
    start_date: todayKey,
    override_acknowledged_at: overrideAcknowledged ? new Date().toISOString() : null,
    override_signature: overrideAcknowledged ? signature : null,
  }).select().single()

  if (error || !milestone) {
    console.error('Milestone insert error:', error)
    return NextResponse.json({ error: 'Kunde inte spara delmålet' }, { status: 500 })
  }

  const result = await refreezeDeficitBudget(supabase, user.id, 'milestone_set')
  return NextResponse.json({ milestone, result })
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

  const { data: milestone } = await supabase
    .from('deficit_milestones')
    .select('id')
    .eq('user_id', user.id).eq('status', 'active')
    .maybeSingle()
  if (!milestone) return NextResponse.json({ error: 'Inget aktivt delmål' }, { status: 404 })

  // Explicit cancel intentionally does NOT force the rolling-current-weight
  // start (unlike expiry/early-reach) — it reverts to the overall goal
  // exactly as it was before the delmål, not a recalibration from today.
  await supabase.from('deficit_milestones').update({ status: 'cancelled', resolved_at: new Date().toISOString() }).eq('id', milestone.id)
  const result = await refreezeDeficitBudget(supabase, user.id, 'milestone_cancelled')
  return NextResponse.json({ ok: true, result })
}
