import { createSupabaseServerClient } from '@/lib/supabase-server'
import ViktmalClient, { type DayEntry, type Measurement, type CheckinHistoryRow } from '@/components/ViktmalClient'
import { stockholmDateKey } from '@/lib/dates'
import { normalizeYazioDay, type YazioDay } from '@/lib/yazio-history'
import { computeDayCompleteness, kcalTotalForDay, KOST_MEALS, type KostMeal, type KostFoodEntry } from '@/lib/kost'

const ROLLING_WINDOW_DAYS = 7
const MEASUREMENT_LOOKBACK_DAYS = 120

function weekDateKeysEndingToday(todayKey: string): string[] {
  const end = new Date(`${todayKey}T00:00:00`)
  return Array.from({ length: ROLLING_WINDOW_DAYS }, (_, i) => {
    const d = new Date(end)
    d.setDate(d.getDate() - (ROLLING_WINDOW_DAYS - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

export default async function ViktmalPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('deficit_tracking_enabled, deficit_start_weight_kg, deficit_start_date, deficit_target_weight_kg, deficit_target_date, deficit_tdee_kcal, deficit_budget_kcal, deficit_budget_computed_at, deficit_weigh_in_weekday, deficit_garmin_correction, kost_tracked_meals')
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
  const rollingDays = weekDateKeysEndingToday(todayKey)
  const sinceIso = new Date(new Date(`${rollingDays[0]}T00:00:00`).getTime()).toISOString()
  const measurementSince = new Date(new Date().getTime() - MEASUREMENT_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10)

  const todayStartIso = new Date(`${todayKey}T00:00:00`).toISOString()
  const [{ data: foodLog }, { data: yazioHistoryRow }, { data: dayStatusRows }, { data: measurementRows }, { data: todayActs }] = await Promise.all([
    supabase.from('food_log').select('id, name, calories, protein_g, carb_g, fat_g, meal, source, logged_at')
      .eq('user_id', user.id).gte('logged_at', sinceIso),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_history').single(),
    supabase.from('kost_day_status').select('date').eq('user_id', user.id).eq('status', 'complete')
      .gte('date', rollingDays[0]).lte('date', todayKey),
    supabase.from('body_measurements').select('measured_on, weight_kg, waist_cm, source')
      .eq('user_id', user.id).gte('measured_on', measurementSince).order('measured_on', { ascending: true }),
    // Modell B reference (Daniel's spec: show it, never let it drive the
    // budget) — today's own training calories, same "raw, uncorrected"
    // number the Kalorier-idag card already reads.
    supabase.from('activities').select('calories').eq('user_id', user.id).gte('start_date', todayStartIso),
  ])
  const todayTrainingKcalRaw = (todayActs ?? []).reduce((s, a) => s + (a.calories ?? 0), 0)

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

  // Precedence matches dashboard/page.tsx's own calorie card: a synced
  // YAZIO day (with an actual kcalEaten value) wins over the manual log for
  // that date — never both summed together.
  const days: DayEntry[] = rollingDays.map(dateKey => {
    const yazioDay = yazioByDate.get(dateKey)
    if (yazioDay?.kcalEaten != null) {
      return { date: dateKey, eatenKcal: yazioDay.kcalEaten, isComplete: true, source: 'yazio' as const }
    }
    const entries = manualByDate.get(dateKey) ?? []
    const completeness = computeDayCompleteness(trackedMeals, entries, dayOverrides.has(dateKey))
    return {
      date: dateKey,
      eatenKcal: kcalTotalForDay(entries),
      isComplete: completeness.status === 'complete',
      source: 'manual' as const,
    }
  })

  const measurements: Measurement[] = (measurementRows ?? []).map(r => ({
    date: r.measured_on as string,
    weightKg: r.weight_kg as number | null,
    waistCm: r.waist_cm as number | null,
    source: r.source as 'manual' | 'yazio',
  }))

  const { data: checkinRows } = await supabase
    .from('deficit_checkins')
    .select('id, period_start, period_end, predicted_kg, actual_kg, old_correction, suggested_correction, applied_correction, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <ViktmalClient
      todayKey={todayKey}
      days={days}
      measurements={measurements}
      budgetKcal={profile.deficit_budget_kcal ?? null}
      tdeeKcal={profile.deficit_tdee_kcal ?? null}
      budgetComputedAt={profile.deficit_budget_computed_at ?? null}
      startWeightKg={profile.deficit_start_weight_kg ?? null}
      startDate={profile.deficit_start_date ?? null}
      targetWeightKg={profile.deficit_target_weight_kg ?? null}
      targetDate={profile.deficit_target_date ?? null}
      weighInWeekday={profile.deficit_weigh_in_weekday ?? 0}
      todayTrainingKcalRaw={todayTrainingKcalRaw}
      garminCorrection={profile.deficit_garmin_correction ?? 0.75}
      checkinHistory={(checkinRows ?? []) as CheckinHistoryRow[]}
    />
  )
}
