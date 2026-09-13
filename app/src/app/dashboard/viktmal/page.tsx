import { createSupabaseServerClient } from '@/lib/supabase-server'
import ViktmalClient, { type DayEntry, type Measurement, type CheckinHistoryRow, type ActiveMilestone, type BudgetEvent } from '@/components/ViktmalClient'
import { stockholmDateKey } from '@/lib/dates'
import { normalizeYazioDay, type YazioDay } from '@/lib/yazio-history'
import { computeDayCompleteness, kcalTotalForDay, KOST_MEALS, type KostMeal, type KostFoodEntry } from '@/lib/kost'
import { budgetInForceOn, tdeeInForceOn } from '@/lib/deficit'

const ROLLING_WINDOW_DAYS = 7
// Daniel: "vi har ju datat, onödigt att bara räkna på veckan" — ett andra,
// längre fönster för en mindre bullrig trendsiffra, utöver 7-dagars snitt.
// Inte en ersättning: 7 dagar förblir "hur går det just nu", 14 dagar är
// "är det här en riktig trend". Bygger på samma dagsdata, bara ett bredare
// fönster.
const TREND_WINDOW_DAYS = 14
const MEASUREMENT_LOOKBACK_DAYS = 120

function dateKeysEndingToday(todayKey: string, count: number): string[] {
  const end = new Date(`${todayKey}T00:00:00`)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end)
    d.setDate(d.getDate() - (count - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

export default async function ViktmalPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('deficit_tracking_enabled, deficit_start_weight_kg, deficit_start_date, deficit_target_weight_kg, deficit_target_date, deficit_tdee_kcal, deficit_budget_kcal, deficit_budget_computed_at, deficit_budget_source, deficit_budget_valid_until, deficit_weigh_in_weekday, deficit_garmin_correction, kost_tracked_meals')
    .eq('id', user.id)
    .single()

  if (!profile?.deficit_tracking_enabled) {
    return (
      <div className="p-4 md:p-8 max-w-2xl w-full mx-auto flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Viktmål</h1>
          <p className="text-muted text-sm mt-1">Sätt en målvikt och ett datum så räknar vi ut en fast daglig kaloribudget.</p>
        </div>
        <div className="bg-card border border-edge rounded-2xl p-4">
          <p className="text-fg text-sm mb-3">Du har inte satt något viktmål än.</p>
          <a href="/dashboard/profil" className="inline-block bg-accent text-bg font-semibold text-sm px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity">Sätt upp i Profil</a>
        </div>
      </div>
    )
  }

  const todayKey = stockholmDateKey()
  // Fetched wide enough to cover the trend window — the 7-day window used
  // everywhere else below is just the most recent slice of the same data,
  // one query instead of two.
  const trendDays = dateKeysEndingToday(todayKey, TREND_WINDOW_DAYS)
  const sinceIso = new Date(new Date(`${trendDays[0]}T00:00:00`).getTime()).toISOString()
  const measurementSince = new Date(new Date().getTime() - MEASUREMENT_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10)

  const todayStartIso = new Date(`${todayKey}T00:00:00`).toISOString()
  const [{ data: foodLog }, { data: yazioHistoryRow }, { data: dayStatusRows }, { data: measurementRows }, { data: todayActs }, { data: wellnessRow }] = await Promise.all([
    supabase.from('food_log').select('id, name, calories, protein_g, carb_g, fat_g, meal, source, logged_at')
      .eq('user_id', user.id).gte('logged_at', sinceIso),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_history').single(),
    supabase.from('kost_day_status').select('date').eq('user_id', user.id).eq('status', 'complete')
      .gte('date', trendDays[0]).lte('date', todayKey),
    supabase.from('body_measurements').select('measured_on, weight_kg, waist_cm, source')
      .eq('user_id', user.id).gte('measured_on', measurementSince).order('measured_on', { ascending: true }),
    // Modell B reference (Daniel's spec: show it, never let it drive the
    // budget) — today's own training calories, same "raw, uncorrected"
    // number the Kalorier-idag card already reads.
    supabase.from('activities').select('calories').eq('user_id', user.id).gte('start_date', todayStartIso),
    // Idea #3/#6: rest-day-mode signal + sleep context — same wellness
    // history dashboard/page.tsx and Hälsa already read, info-only here,
    // never touches the budget.
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
  ])
  const todayTrainingKcalRaw = (todayActs ?? []).reduce((s, a) => s + (a.calories ?? 0), 0)

  const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const wellnessHistory: { date: string; restingHR: number | null; bodyBattery: number | null; sleepHours: number | null }[] =
    wellnessRaw ? (() => {
      try {
        const parsed = JSON.parse(wellnessRaw)
        return Array.isArray(parsed?.history) ? parsed.history : []
      } catch { return [] }
    })() : []

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
  const trackedMeals = ((profile?.kost_tracked_meals as string[] | null) ?? ['breakfast', 'lunch', 'dinner']).filter((m): m is KostMeal => (KOST_MEALS as string[]).includes(m))

  const [{ data: checkinRows }, { data: activeMilestoneRow }, { data: budgetEventRows }, { data: allBudgetEventRows }, { data: recentlyResolvedRow }, { data: todayNoteRow }] = await Promise.all([
    supabase.from('deficit_checkins')
      .select('id, period_start, period_end, predicted_kg, actual_kg, old_correction, suggested_correction, applied_correction, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('deficit_milestones')
      .select('id, target_weight_kg, target_date, start_weight_kg, start_date, segment_budget_kcal, segment_daily_deficit_kcal')
      .eq('user_id', user.id).eq('status', 'active').maybeSingle(),
    supabase.from('deficit_budget_events')
      .select('id, kind, old_budget_kcal, new_budget_kcal, budget_source, override_active, created_at, bmr_kcal, training_kcal, neat_factor, garmin_correction')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
    // Separate, unlimited, ascending fetch for reconstructing which
    // budget/TDEE was actually in force on each day of the trend window
    // (Daniel: "egentligen ska inte de ändras retroaktivt") — the
    // descending limit-10 fetch above is for the Budgethistorik display
    // only and can't be reused here, since a burst of changes could push a
    // relevant older event past that limit.
    supabase.from('deficit_budget_events')
      .select('created_at, new_budget_kcal, new_tdee_kcal')
      .eq('user_id', user.id).order('created_at', { ascending: true }),
    // A milestone resolved in the last few days gets a one-time banner —
    // shown for a fixed window rather than tracked as "seen" server-side,
    // simplest thing that still surfaces it without a dismiss round-trip.
    supabase.from('deficit_milestones')
      .select('target_weight_kg, status, resolved_at')
      .eq('user_id', user.id).in('status', ['passed', 'reached'])
      .gte('resolved_at', new Date(new Date().getTime() - 3 * 86400000).toISOString())
      .order('resolved_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('day_context_notes').select('tag, note').eq('user_id', user.id).eq('date', todayKey).maybeSingle(),
  ])
  const budgetEventsAsc = (allBudgetEventRows ?? []).map(r => ({
    createdAt: r.created_at as string,
    newBudgetKcal: r.new_budget_kcal as number | null,
    newTdeeKcal: r.new_tdee_kcal as number | null,
  }))
  const currentBudgetKcal = profile.deficit_budget_kcal ?? 0
  const currentTdeeKcal = profile.deficit_tdee_kcal ?? 0

  // Precedence matches dashboard/page.tsx's own calorie card: a synced
  // YAZIO day (with an actual kcalEaten value) wins over the manual log for
  // that date — never both summed together. Each day carries the
  // budget/TDEE that was ACTUALLY in force that day (see budgetInForceOn/
  // tdeeInForceOn) rather than today's current ones, so a later budget
  // change never silently rewrites how an already-passed day is judged.
  const buildDayEntry = (dateKey: string): DayEntry => {
    const yazioDay = yazioByDate.get(dateKey)
    const budgetKcalForDay = budgetInForceOn(dateKey, currentBudgetKcal, budgetEventsAsc)
    const tdeeKcalForDay = tdeeInForceOn(dateKey, currentTdeeKcal, budgetEventsAsc)
    if (yazioDay?.kcalEaten != null) {
      return { date: dateKey, eatenKcal: yazioDay.kcalEaten, isComplete: true, source: 'yazio' as const, budgetKcal: budgetKcalForDay, tdeeKcal: tdeeKcalForDay }
    }
    const entries = manualByDate.get(dateKey) ?? []
    const completeness = computeDayCompleteness(trackedMeals, entries, dayOverrides.has(dateKey))
    return {
      date: dateKey,
      eatenKcal: kcalTotalForDay(entries),
      isComplete: completeness.status === 'complete',
      source: 'manual' as const,
      budgetKcal: budgetKcalForDay,
      tdeeKcal: tdeeKcalForDay,
    }
  }
  const trendDayEntries: DayEntry[] = trendDays.map(buildDayEntry)
  const days: DayEntry[] = trendDayEntries.slice(-ROLLING_WINDOW_DAYS)

  const measurements: Measurement[] = (measurementRows ?? []).map(r => ({
    date: r.measured_on as string,
    weightKg: r.weight_kg as number | null,
    waistCm: r.waist_cm as number | null,
    source: r.source as 'manual' | 'yazio',
  }))

  return (
    <ViktmalClient
      todayKey={todayKey}
      days={days}
      trendDays={trendDayEntries}
      measurements={measurements}
      budgetKcal={profile.deficit_budget_kcal ?? null}
      tdeeKcal={profile.deficit_tdee_kcal ?? null}
      budgetComputedAt={profile.deficit_budget_computed_at ?? null}
      budgetSource={(profile.deficit_budget_source ?? 'overall') as 'overall' | 'milestone'}
      startWeightKg={profile.deficit_start_weight_kg ?? null}
      startDate={profile.deficit_start_date ?? null}
      targetWeightKg={profile.deficit_target_weight_kg ?? null}
      targetDate={profile.deficit_target_date ?? null}
      weighInWeekday={profile.deficit_weigh_in_weekday ?? 0}
      todayTrainingKcalRaw={todayTrainingKcalRaw}
      garminCorrection={profile.deficit_garmin_correction ?? 0.75}
      checkinHistory={(checkinRows ?? []) as CheckinHistoryRow[]}
      wellnessHistory={wellnessHistory}
      activeMilestone={activeMilestoneRow as ActiveMilestone | null}
      budgetEvents={(budgetEventRows ?? []) as BudgetEvent[]}
      recentlyResolvedMilestone={recentlyResolvedRow as { target_weight_kg: number; status: 'passed' | 'reached'; resolved_at: string } | null}
      todayNote={todayNoteRow as { tag: string | null; note: string | null } | null}
    />
  )
}
