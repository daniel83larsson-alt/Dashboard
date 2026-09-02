import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dedupeForStats, type ActivityRow } from '@/lib/duplicates'
import { computeDayCompleteness, kcalTotalForDay, KOST_MEALS, type KostMeal, type KostFoodEntry } from '@/lib/kost'
import { normalizeYazioDay, type YazioDay } from '@/lib/yazio-history'
import { selectCheckinPeriod, computeDeficitCheckin, type DeficitCheckinResult } from '@/lib/deficit'
import { logApiCall } from '@/lib/log-api-call'
import { checkAndConsumeRateLimit } from '@/lib/rate-limit'
import { decryptMaybeLegacy } from '@/lib/encrypt'
import { callGemini, callAnthropic } from '@/lib/llm'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import { coachToneInstruction } from '@/lib/coach-tone'

// AI commentary only for the two statuses with real substance to react to
// — too_sparse/too_small_sample already get clear deterministic copy in the
// UI, no model call needed (saves shared-quota spend for the cases where an
// AI sentence wouldn't add anything). The model NEVER proposes a number —
// it only narrates what computeDeficitCheckin's formula already decided.
const NARRATIVE_SYSTEM = `Du är en ärlig, kortfattad kostcoach som kommenterar resultatet av en periodisk avstämning av ett viktmål. Du får redan uträknade siffror (aldrig råa mätvärden att tolka själv) — kommentera dem, föreslå aldrig en egen siffra eller justering. Max 3-4 meningar, konkret, aldrig floskler. Aldrig skambeläggande ton kring vikt.`

async function generateCheckinNarrative(
  supabase: SupabaseClient,
  userId: string,
  summary: string,
  coachTone: string | null | undefined,
): Promise<string | null> {
  try {
    const { data: profile } = await supabase.from('profiles').select('llm_api_key_encrypted, llm_provider').eq('id', userId).single()
    const userApiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : null
    if (!userApiKey) {
      const rate = await checkAndConsumeRateLimit(supabase, userId)
      if (!rate.allowed) return null
    }
    const system = `${NARRATIVE_SYSTEM}\n${coachToneInstruction(coachTone)}`
    const narrative = userApiKey && profile?.llm_provider === 'anthropic'
      ? await callAnthropic(userApiKey, system, [], summary)
      : await callGemini(userApiKey ?? process.env.GEMINI_API_KEY!, system, [], summary)
    return narrative
  } catch (err) {
    console.error('Deficit checkin narrative failed:', err)
    return null
  }
}

type CheckinComputation =
  | { available: false; reason: 'no_goal' | 'too_new' }
  | {
      available: true
      periodStartDate: string
      periodEndDate: string
      periodDays: number
      loggedDays: number
      loggedDeficitKcal: number
      weightStartKg: number
      weightEndKg: number
      waistStartCm: number | null
      waistEndCm: number | null
      avgTrainingKcalRaw: number
      oldCorrection: number
      result: DeficitCheckinResult
    }

function daysBetweenInclusive(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00`).getTime()
  const end = new Date(`${endISO}T00:00:00`).getTime()
  return Math.round((end - start) / 86400000) + 1
}

// Shared by GET (preview, no writes) and POST (persist a row) — kept as a
// plain function here rather than in lib/deficit.ts, which stays pure/no-
// I/O by design (same contract as kost.ts/weekly-kost.ts).
async function computeCheckinForUser(supabase: SupabaseClient, userId: string): Promise<CheckinComputation> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('deficit_tracking_enabled, deficit_budget_kcal, deficit_garmin_correction, kost_tracked_meals')
    .eq('id', userId)
    .single()

  if (!profile?.deficit_tracking_enabled || profile.deficit_budget_kcal == null) return { available: false, reason: 'no_goal' }

  const { data: weightRows } = await supabase
    .from('body_measurements')
    .select('measured_on, weight_kg')
    .eq('user_id', userId)
    .not('weight_kg', 'is', null)
    .order('measured_on', { ascending: true })

  const period = selectCheckinPeriod((weightRows ?? []).map(r => ({ date: r.measured_on as string, weightKg: r.weight_kg as number })))
  if (!period) return { available: false, reason: 'too_new' }

  const { periodStartDate, periodEndDate, weightStartKg, weightEndKg } = period
  const periodDays = daysBetweenInclusive(periodStartDate, periodEndDate)
  const periodStartIso = `${periodStartDate}T00:00:00.000Z`
  const periodEndIsoExclusive = new Date(new Date(`${periodEndDate}T00:00:00Z`).getTime() + 86400000).toISOString()

  const [{ data: waistRows }, { data: foodLog }, { data: yazioHistoryRow }, { data: dayStatusRows }, { data: acts }] = await Promise.all([
    supabase.from('body_measurements').select('measured_on, waist_cm').eq('user_id', userId).not('waist_cm', 'is', null)
      .gte('measured_on', periodStartDate).lte('measured_on', periodEndDate).order('measured_on', { ascending: true }),
    supabase.from('food_log').select('id, name, calories, protein_g, carb_g, fat_g, meal, source, logged_at')
      .eq('user_id', userId).gte('logged_at', periodStartIso).lt('logged_at', periodEndIsoExclusive),
    supabase.from('coach_sessions').select('messages').eq('user_id', userId).eq('coach_id', 'yazio_history').single(),
    supabase.from('kost_day_status').select('date').eq('user_id', userId).eq('status', 'complete')
      .gte('date', periodStartDate).lte('date', periodEndDate),
    supabase.from('activities').select('id, strava_id, source, start_date, distance, moving_time, sport_type, calories')
      .eq('user_id', userId).gte('start_date', periodStartIso).lt('start_date', periodEndIsoExclusive),
  ])

  const waistList = (waistRows ?? []) as { measured_on: string; waist_cm: number }[]
  const waistStartCm = waistList.length ? waistList[0].waist_cm : null
  const waistEndCm = waistList.length ? waistList[waistList.length - 1].waist_cm : null

  const yazioHistoryRaw = (yazioHistoryRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const yazioHistory: YazioDay[] = yazioHistoryRaw ? (() => {
    try {
      const parsed = JSON.parse(yazioHistoryRaw)
      return Array.isArray(parsed) ? parsed.map(normalizeYazioDay) : []
    } catch { return [] }
  })() : []
  const yazioByDate = new Map(yazioHistory.map(d => [d.date, d]))

  const manualByDate = new Map<string, KostFoodEntry[]>()
  for (const e of (foodLog ?? []) as KostFoodEntry[]) {
    const key = e.logged_at.slice(0, 10)
    if (!manualByDate.has(key)) manualByDate.set(key, [])
    manualByDate.get(key)!.push(e)
  }
  const dayOverrides = new Set((dayStatusRows ?? []).map(r => r.date as string))
  const trackedMeals = ((profile.kost_tracked_meals as string[] | null) ?? ['breakfast', 'lunch', 'dinner']).filter((m): m is KostMeal => (KOST_MEALS as string[]).includes(m))

  const dayKeys = Array.from({ length: periodDays }, (_, i) => {
    const d = new Date(`${periodStartDate}T00:00:00`)
    d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  let loggedDays = 0
  let loggedDeficitKcal = 0
  for (const dateKey of dayKeys) {
    const yazioDay = yazioByDate.get(dateKey)
    let eatenKcal: number
    let isComplete: boolean
    if (yazioDay?.kcalEaten != null) {
      eatenKcal = yazioDay.kcalEaten
      isComplete = true
    } else {
      const entries = manualByDate.get(dateKey) ?? []
      const completeness = computeDayCompleteness(trackedMeals, entries, dayOverrides.has(dateKey))
      eatenKcal = kcalTotalForDay(entries)
      isComplete = completeness.status === 'complete'
    }
    if (isComplete) {
      loggedDays++
      loggedDeficitKcal += profile.deficit_budget_kcal - eatenKcal
    }
  }

  const dedupedActs = dedupeForStats((acts ?? []) as ActivityRow[])
  const avgTrainingKcalRaw = dedupedActs.reduce((s, a) => s + ((a as ActivityRow & { calories?: number | null }).calories ?? 0), 0) / periodDays

  const oldCorrection = profile.deficit_garmin_correction ?? 0.75
  const result = computeDeficitCheckin({
    periodDays, loggedDays, loggedDeficitKcal, weightStartKg, weightEndKg,
    avgTrainingKcalRaw: Math.max(avgTrainingKcalRaw, 1), oldCorrection,
  })

  return { available: true, periodStartDate, periodEndDate, periodDays, loggedDays, loggedDeficitKcal, weightStartKg, weightEndKg, waistStartCm, waistEndCm, avgTrainingKcalRaw, oldCorrection, result }
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const computation = await computeCheckinForUser(supabase, user.id)
  return NextResponse.json(computation)
}

export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

  const computation = await computeCheckinForUser(supabase, user.id)
  if (!computation.available) return NextResponse.json(computation, { status: 400 })

  const { periodStartDate, periodEndDate, periodDays, loggedDays, loggedDeficitKcal, weightStartKg, weightEndKg, waistStartCm, waistEndCm, avgTrainingKcalRaw, oldCorrection, result } = computation

  let narrative: string | null = null
  if (result.status === 'on_track' || result.status === 'adjust') {
    logApiCall(supabase, user.id, 'deficit_checkin_narrative')
    const { data: profileForTone } = await supabase.from('profiles').select('coach_tone').eq('id', user.id).single()
    const summary = result.status === 'on_track'
      ? `Period ${periodStartDate} till ${periodEndDate} (${periodDays} dagar, ${loggedDays} loggade). Loggen antydde ${result.predictedKg.toFixed(1)} kg förändring, faktisk vägning visade ${result.actualKg.toFixed(1)} kg. Systemet är rimligt kalibrerat, ingen justering föreslås.`
      : `Period ${periodStartDate} till ${periodEndDate} (${periodDays} dagar, ${loggedDays} loggade). Loggen antydde ${result.predictedKg.toFixed(1)} kg förändring, faktisk vägning visade ${result.actualKg.toFixed(1)} kg — en avvikelse. Föreslagen justering av träningskaloriernas korrigeringsfaktor: ${oldCorrection.toFixed(2)} → ${result.suggestedCorrection.toFixed(2)} (${result.suggestedCorrection > oldCorrection ? 'höjs, verklig förbrukning verkar högre än antaget' : 'sänks, träningskalorierna verkar mer överskattade än antaget'}).`
    narrative = await generateCheckinNarrative(supabase, user.id, summary, profileForTone?.coach_tone)
  }

  const row = {
    user_id: user.id,
    period_start: periodStartDate,
    period_end: periodEndDate,
    period_days: periodDays,
    logged_days: loggedDays,
    logged_deficit_kcal: Math.round(loggedDeficitKcal),
    weight_start_kg: weightStartKg,
    weight_end_kg: weightEndKg,
    waist_start_cm: waistStartCm,
    waist_end_cm: waistEndCm,
    avg_training_kcal_raw: avgTrainingKcalRaw,
    old_correction: oldCorrection,
    suggested_correction: result.status === 'adjust' ? result.suggestedCorrection : null,
    predicted_kg: result.status === 'too_sparse' ? null : (result as { predictedKg: number }).predictedKg,
    actual_kg: result.status === 'too_sparse' ? null : (result as { actualKg: number }).actualKg,
    narrative,
  }

  const { data: entry, error } = await supabase.from('deficit_checkins').insert(row).select().single()
  if (error) {
    console.error('Deficit checkin insert error:', error)
    return NextResponse.json({ error: 'Kunde inte spara avstämningen' }, { status: 500 })
  }

  return NextResponse.json({ ...computation, checkinId: entry.id, narrative })
}
