// The ONLY place a Viktmål budget is ever written after this — replaces
// the two previous copies (ProfileForm's client-side compute, checkin/
// apply's inline recompute) with one server-side path that knows about
// delmål segments and above-safe overrides. I/O orchestration around the
// pure lib/deficit.ts functions, same shape as checkin/route.ts's
// computeCheckinForUser.
import type { SupabaseClient } from '@supabase/supabase-js'
import { estimateBMR } from './bmr'
import { dedupeForStats, type ActivityRow } from './duplicates'
import { stockholmDateKey } from './dates'
import {
  computeDeficitBudget, resolveActiveGoalSegment, computeRollingWeightAverage, deficitOverrideSignature,
  type GoalSegment, type DeficitSafety, type GoalSegmentSource,
} from './deficit'

const TRAINING_LOOKBACK_DAYS = 28
const MIN_TRAINING_HISTORY_DAYS = 14

export type RefreezeReason =
  | 'settings_changed' | 'checkin_applied' | 'milestone_set'
  | 'milestone_expired' | 'milestone_reached' | 'milestone_cancelled'
  | 'override_acknowledged' | 'override_voided' | 'stale_refresh'

export type RefreezeResult = {
  changed: boolean
  before: { budgetKcal: number | null; dailyDeficitKcal: number | null; source: GoalSegmentSource } | null
  after: { budgetKcal: number; dailyDeficitKcal: number; tdeeKcal: number; source: GoalSegmentSource; validUntilISO: string | null }
  segment: GoalSegment
  safety: DeficitSafety
  eventId: string | null
} | null

// The reasons that mean "a delmål just stopped applying" — the start
// weight for the recomputed (calmer) overall budget should reflect where
// the person actually is NOW, not the frozen weight from when the overall
// goal was first set — otherwise "snabbare delmål, sen lugnare
// övergripande mål" silently fails (see the worked example in the plan).
const MILESTONE_TRANSITION_REASONS: RefreezeReason[] = ['milestone_expired', 'milestone_reached']

export async function refreezeDeficitBudget(supabase: SupabaseClient, userId: string, reason: RefreezeReason): Promise<RefreezeResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      weight_kg, height_cm, birth_year, biological_sex,
      deficit_tracking_enabled, deficit_start_weight_kg, deficit_start_date, deficit_target_weight_kg, deficit_target_date,
      deficit_neat_factor, deficit_activity_fallback_kcal, deficit_garmin_correction,
      deficit_budget_kcal, deficit_tdee_kcal, deficit_budget_daily_deficit_kcal, deficit_budget_source,
      deficit_override_acknowledged_at, deficit_override_signature
    `)
    .eq('id', userId)
    .single()

  if (!profile?.deficit_tracking_enabled || profile.deficit_start_weight_kg == null || profile.deficit_target_weight_kg == null || !profile.deficit_target_date) {
    return null
  }

  const [{ data: milestoneRow }, { data: weighInRows }, { data: recentActs }] = await Promise.all([
    supabase.from('deficit_milestones')
      .select('id, target_weight_kg, target_date, start_weight_kg, override_acknowledged_at, override_signature')
      .eq('user_id', userId).eq('status', 'active').maybeSingle(),
    supabase.from('body_measurements')
      .select('measured_on, weight_kg')
      .eq('user_id', userId).not('weight_kg', 'is', null)
      .order('measured_on', { ascending: false }).limit(30),
    (() => {
      const since = new Date()
      since.setDate(since.getDate() - TRAINING_LOOKBACK_DAYS)
      return supabase.from('activities')
        .select('id, strava_id, source, start_date, distance, moving_time, sport_type, calories')
        .eq('user_id', userId).gte('start_date', since.toISOString())
    })(),
  ])

  const todayKey = stockholmDateKey()
  const weighIns = (weighInRows ?? []).map(r => ({ date: r.measured_on as string, weightKg: r.weight_kg as number }))

  const overallSignature = deficitOverrideSignature({
    startWeightKg: profile.deficit_start_weight_kg, targetWeightKg: profile.deficit_target_weight_kg, targetDateISO: profile.deficit_target_date,
  })
  const overallOverrideAcknowledged = !!profile.deficit_override_acknowledged_at && profile.deficit_override_signature === overallSignature

  const milestoneOverrideAcknowledged = !!milestoneRow?.override_acknowledged_at && milestoneRow.override_signature === (
    milestoneRow ? deficitOverrideSignature({ startWeightKg: milestoneRow.start_weight_kg, targetWeightKg: milestoneRow.target_weight_kg, targetDateISO: milestoneRow.target_date }) : ''
  )

  const segment = resolveActiveGoalSegment({
    overall: {
      startWeightKg: profile.deficit_start_weight_kg,
      targetWeightKg: profile.deficit_target_weight_kg,
      targetDateISO: profile.deficit_target_date,
      overrideAcknowledged: overallOverrideAcknowledged,
    },
    milestone: milestoneRow ? {
      targetWeightKg: milestoneRow.target_weight_kg,
      targetDateISO: milestoneRow.target_date,
      overrideAcknowledged: milestoneOverrideAcknowledged,
    } : null,
    todayKey,
  })

  // A delmål in force, or one that JUST stopped being in force, uses the
  // current rolling weight as the segment's start — the frozen overall
  // deficit_start_weight_kg otherwise, so an ordinary settings save on an
  // account with no milestone is bit-identical to before this existed.
  const useRollingStart = segment.source === 'milestone' || MILESTONE_TRANSITION_REASONS.includes(reason)
  const rolling = computeRollingWeightAverage(weighIns, todayKey, { windowDays: 14, maxReadings: 7, minReadings: 1 })
  const effectiveStartWeightKg = useRollingStart
    ? (rolling.avgKg ?? rolling.latestKg ?? profile.weight_kg ?? profile.deficit_start_weight_kg)
    : profile.deficit_start_weight_kg

  const dedupedActs = dedupeForStats((recentActs ?? []) as (ActivityRow & { calories?: number | null })[])
  const trainingDaysWithActivity = new Set(dedupedActs.map(a => a.start_date.slice(0, 10))).size
  const avgTrainingKcalRaw = trainingDaysWithActivity >= MIN_TRAINING_HISTORY_DAYS
    ? dedupedActs.reduce((s, a) => s + (a.calories ?? 0), 0) / TRAINING_LOOKBACK_DAYS
    : null

  const bmr = estimateBMR({
    weightKg: profile.weight_kg, heightCm: profile.height_cm, birthYear: profile.birth_year, biologicalSex: profile.biological_sex,
  }).bmr

  const allowUnsafe = segment.overrideAcknowledged
  const budget = computeDeficitBudget({
    bmr,
    goal: {
      startWeightKg: effectiveStartWeightKg,
      targetWeightKg: segment.targetWeightKg,
      targetDateISO: segment.targetDateISO,
      neatFactor: profile.deficit_neat_factor ?? 1.25,
      garminCorrection: profile.deficit_garmin_correction ?? 0.75,
    },
    avgTrainingKcalRaw,
    activityFallbackKcal: profile.deficit_activity_fallback_kcal ?? 300,
    now: new Date(),
    allowUnsafe,
  })

  const before = profile.deficit_budget_kcal != null
    ? { budgetKcal: profile.deficit_budget_kcal, dailyDeficitKcal: profile.deficit_budget_daily_deficit_kcal, source: (profile.deficit_budget_source ?? 'overall') as GoalSegmentSource }
    : null
  const changed = before == null || before.budgetKcal !== budget.budgetKcal || before.source !== segment.source

  const nowIso = new Date().toISOString()
  await supabase.from('profiles').update({
    deficit_tdee_kcal: budget.tdeeKcal,
    deficit_budget_kcal: budget.budgetKcal,
    deficit_budget_computed_at: nowIso,
    deficit_budget_source: segment.source,
    deficit_budget_valid_until: segment.validUntilISO,
    deficit_budget_daily_deficit_kcal: budget.dailyDeficitKcal,
    // Snapshot for display only ("du använder ett bekräftat underskott på X
    // kcal/dag") — the acknowledgement itself (acknowledged_at/signature)
    // is written by the caller before this runs; this just mirrors the
    // number that acknowledgement is currently producing, null once it
    // stops applying.
    deficit_override_deficit_kcal: budget.overrideActive ? budget.dailyDeficitKcal : null,
  }).eq('id', userId)

  if (milestoneRow) {
    if (MILESTONE_TRANSITION_REASONS.includes(reason)) {
      await supabase.from('deficit_milestones').update({
        status: reason === 'milestone_expired' ? 'passed' : 'reached',
        resolved_at: nowIso,
      }).eq('id', milestoneRow.id)
    } else if (segment.source === 'milestone') {
      await supabase.from('deficit_milestones').update({
        segment_tdee_kcal: budget.tdeeKcal,
        segment_budget_kcal: budget.budgetKcal,
        segment_daily_deficit_kcal: budget.dailyDeficitKcal,
      }).eq('id', milestoneRow.id)
    }
  }

  let eventId: string | null = null
  if (changed) {
    const { data: eventRow } = await supabase.from('deficit_budget_events').insert({
      user_id: userId,
      kind: reason,
      milestone_id: milestoneRow?.id ?? null,
      old_budget_kcal: before?.budgetKcal ?? null,
      new_budget_kcal: budget.budgetKcal,
      old_daily_deficit_kcal: before?.dailyDeficitKcal ?? null,
      new_daily_deficit_kcal: budget.dailyDeficitKcal,
      budget_source: segment.source,
      override_active: budget.overrideActive,
    }).select('id').single()
    eventId = eventRow?.id ?? null
  }

  return {
    changed,
    before,
    after: { budgetKcal: budget.budgetKcal, dailyDeficitKcal: budget.dailyDeficitKcal, tdeeKcal: budget.tdeeKcal, source: segment.source, validUntilISO: segment.validUntilISO },
    segment,
    safety: budget.safety,
    eventId,
  }
}
