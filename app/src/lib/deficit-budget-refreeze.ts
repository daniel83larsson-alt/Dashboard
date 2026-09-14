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
  daysWithRealTrainingCalories,
  type GoalSegment, type DeficitSafety, type GoalSegmentSource, type BudgetChangeInputs,
} from './deficit'

// 14 days, not 28 — Daniel: "testa 14-dagarssnitt som kompromiss... då
// får du snabbare anpassning" (between the old 28-day smoothing and the
// Insikter chart's now-7-day window). Verified against his real data
// before changing: the 28-day window was still being dragged down by a
// 6-day illness gap (23-30 aug) that a 14-day window (from 1 sep onward)
// completely avoids — with 14 days his real recent training (~193
// kcal/dag raw) shows through instead of the blended, stale 28-day
// figure (~158 kcal/dag). Threshold scaled to the same 50% ratio as
// before (was 14 of 28). Exported so Profil's live budget preview
// (app/dashboard/profil/page.tsx) uses the exact same numbers instead of
// a second, independently-drifting copy of the same two constants.
export const TRAINING_LOOKBACK_DAYS = 14
export const MIN_TRAINING_HISTORY_DAYS = 7

export type RefreezeReason =
  | 'settings_changed' | 'checkin_applied' | 'milestone_set'
  | 'milestone_expired' | 'milestone_reached' | 'milestone_cancelled'
  | 'override_acknowledged' | 'override_voided' | 'stale_refresh'
  // Admin-only manual test trigger (Profil's "Räkna om nu (test)" button) —
  // Daniel, as tester: "behöver jag som testare trigga igen på veckan så
  // kör vi det här ifrån." Kept distinct from 'settings_changed' so the
  // history never misrepresents a deliberate test poke as a real settings
  // save.
  | 'manual_test'

export type RefreezeResult = {
  changed: boolean
  before: { budgetKcal: number | null; dailyDeficitKcal: number | null; source: GoalSegmentSource } | null
  after: {
    budgetKcal: number; dailyDeficitKcal: number; tdeeKcal: number; source: GoalSegmentSource; validUntilISO: string | null
    // The exact inputs THIS computation used — lets a caller (the Sunday
    // cron's notification) build a readable "why" via lib/deficit.ts's
    // explainBudgetChange without a second round-trip to re-derive them.
    explainInputs: BudgetChangeInputs
  }
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

export async function refreezeDeficitBudget(
  supabase: SupabaseClient,
  userId: string,
  reason: RefreezeReason,
  // The Sunday-night cron passes true — Daniel's addendum spec: "En post
  // ska ALLTID skrivas i [historiken]... oavsett hur liten skillnaden är,
  // för fullständig historik" for the scheduled weekly run specifically.
  // Every other trigger (delmål, avstämning, en admin-testtryckning) keeps
  // the old changed-only logging — those are rare, deliberate actions
  // where a no-op row would just be noise, not history.
  opts: { alwaysLog?: boolean } = {}
): Promise<RefreezeResult> {
  const { alwaysLog = false } = opts
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
  // Days with an actual non-null calories value, NOT just any activity —
  // see daysWithRealTrainingCalories's comment in lib/deficit.ts for the
  // real incident this fixes (Garmin/Concept2 sync never populate
  // activities.calories, so counting bare activity-days let the average
  // silently collapse toward ~0 instead of falling back).
  const trainingDaysWithRealCalories = daysWithRealTrainingCalories(dedupedActs)
  const avgTrainingKcalRaw = trainingDaysWithRealCalories >= MIN_TRAINING_HISTORY_DAYS
    ? dedupedActs.reduce((s, a) => s + (a.calories ?? 0), 0) / TRAINING_LOOKBACK_DAYS
    : null

  // Daniel's addendum spec: Sunday's recompute is "baserat på veckans
  // rullande viktsnitt" — a single day's weigh-in (±0.5-1.5 kg of water/
  // food/sodium noise) shouldn't move BMR on its own. Applies to every
  // trigger, not just the Sunday cron, so a Profil save and a Sunday
  // recompute on the same day can never silently disagree on which BMR to
  // use. Falls back to the raw stored weight when there's no reading in
  // the window at all (matches the graceful-degradation pattern the
  // milestone-segment start weight above already uses).
  const rollingWeightForBmr = computeRollingWeightAverage(weighIns, todayKey, { windowDays: 7, maxReadings: 7, minReadings: 1 })
  const bmrWeightKg = rollingWeightForBmr.avgKg ?? profile.weight_kg
  const bmr = estimateBMR({
    weightKg: bmrWeightKg, heightCm: profile.height_cm, birthYear: profile.birth_year, biologicalSex: profile.biological_sex,
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

  // The effective inputs THIS computation actually used — stored so the UI
  // can diff two consecutive events and say what moved (Daniel: "vad
  // egentligen de var som triggade ett lägre TDEE") instead of just
  // showing before/after kcal, and returned to the caller so the Sunday
  // cron can build the same explanation for a push notification without a
  // second round-trip. new_tdee_kcal doubles as the per-day TDEE
  // reconstruction lib/deficit.ts's tdeeInForceOn needs.
  const effectiveTrainingKcal = avgTrainingKcalRaw ?? (profile.deficit_activity_fallback_kcal ?? 300)
  const explainInputs: BudgetChangeInputs = {
    bmrKcal: Math.round(bmr),
    trainingKcal: Math.round(effectiveTrainingKcal),
    neatFactor: profile.deficit_neat_factor ?? 1.25,
    garminCorrection: profile.deficit_garmin_correction ?? 0.75,
  }

  let eventId: string | null = null
  if (changed || alwaysLog) {
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
      new_tdee_kcal: budget.tdeeKcal,
      bmr_kcal: explainInputs.bmrKcal,
      training_kcal: explainInputs.trainingKcal,
      neat_factor: explainInputs.neatFactor,
      garmin_correction: explainInputs.garminCorrection,
    }).select('id').single()
    eventId = eventRow?.id ?? null
  }

  return {
    changed,
    before,
    after: { budgetKcal: budget.budgetKcal, dailyDeficitKcal: budget.dailyDeficitKcal, tdeeKcal: budget.tdeeKcal, source: segment.source, validUntilISO: segment.validUntilISO, explainInputs },
    segment,
    safety: budget.safety,
    eventId,
  }
}
