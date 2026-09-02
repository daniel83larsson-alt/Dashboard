import { createSupabaseServerClient } from '@/lib/supabase-server'
import FoodLogClient, { type QuickPick, type FoodEntry, type KostSettings } from '@/components/FoodLogClient'
import { stockholmDateKey } from '@/lib/dates'
import { normalizeYazioDay, type YazioDay } from '@/lib/yazio-history'
import { KOST_METRICS, KOST_MEALS, type KostMetric, type KostMeal, type KostFoodEntry } from '@/lib/kost'
import { resolveDayNutrition } from '@/lib/day-nutrition-source'
import { compute7DayAverage } from '@/lib/deficit'

// 90 dagar bak i tiden räcker för vecka/månad-vyerna utan att hämta hela
// historiken varje sidladdning.
const ENTRY_LOOKBACK_DAYS = 90

export default async function MatPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const sinceIso = new Date(new Date().getTime() - ENTRY_LOOKBACK_DAYS * 86400000).toISOString()

  const [{ data: profile }, { data: recentLog }, { data: quickPicksRaw }, { data: yazioHistoryRow }, { data: dayStatusRows }, { data: insightsRow }] = await Promise.all([
    supabase.from('profiles').select('daily_calorie_goal, kost_tracking_enabled, kost_tracked_metrics, kost_tracked_meals, kost_reminders_enabled, protein_goal_g, carb_goal_g, fat_goal_g, deficit_tracking_enabled, deficit_budget_kcal').eq('id', user.id).single(),
    supabase.from('food_log').select('*').eq('user_id', user.id).gte('logged_at', sinceIso).order('logged_at', { ascending: false }),
    supabase.rpc('food_quick_picks'),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_history').single(),
    supabase.from('kost_day_status').select('date').eq('user_id', user.id).eq('status', 'complete'),
    // Samma AI-genererade kost-granskning som visas på Hälsa & Insikter —
    // återanvänds här istället för ett eget AI-anrop, så en sida inte
    // tömmer kvoten som en annan sida redan betalat för.
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'insights').single(),
  ])

  const todayKey = stockholmDateKey()
  const entries = (recentLog ?? []) as FoodEntry[]

  // 12 räckte inte — Daniel: listan ska fyllas på med allt han lagt till,
  // inte klippas av tidigt. 60 är gott om utrymme utan att bli ett
  // obegränsat query mot en tabell som bara växer; FoodLogClient visar
  // en delmängd med "Visa fler" istället för allt på en gång.
  const quickPicks = ((quickPicksRaw ?? []) as QuickPick[])
    .sort((a, b) => b.times_logged - a.times_logged || b.last_logged.localeCompare(a.last_logged))
    .slice(0, 60)

  const yazioHistoryRaw = (yazioHistoryRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  // normalizeYazioDay backfills fields a row written before meals/water/
  // fasting/weight-trend existed won't have — without it, a user whose
  // last sync predates that change hard-crashes this page (real incident,
  // see STATUS.md) instead of just showing less until their next sync.
  const yazioHistory: YazioDay[] = yazioHistoryRaw ? (() => {
    try {
      const parsed = JSON.parse(yazioHistoryRaw)
      return Array.isArray(parsed) ? parsed.map(normalizeYazioDay) : []
    } catch { return [] }
  })() : []

  const trackedMetrics = ((profile?.kost_tracked_metrics as string[] | null) ?? ['kcal']).filter((m): m is KostMetric => (KOST_METRICS as string[]).includes(m))
  const trackedMeals = ((profile?.kost_tracked_meals as string[] | null) ?? ['breakfast', 'lunch', 'dinner']).filter((m): m is KostMeal => (KOST_MEALS as string[]).includes(m))

  const kostSettings: KostSettings = {
    trackingEnabled: profile?.kost_tracking_enabled ?? false,
    trackedMetrics,
    trackedMeals,
    calorieGoal: profile?.daily_calorie_goal ?? null,
    proteinGoalG: profile?.protein_goal_g ?? null,
    carbGoalG: profile?.carb_goal_g ?? null,
    fatGoalG: profile?.fat_goal_g ?? null,
  }

  const dayOverrides = (dayStatusRows ?? []).map(r => r.date as string)

  // Small header link to Viktmål when it's on — kept a one-liner per the
  // plan ("inget mer"), computed from data already fetched above so this
  // doesn't need its own extra round-trip.
  let deficitSummary: { avgDiffKcal: number; budgetKcal: number } | null = null
  if (profile?.deficit_tracking_enabled && profile.deficit_budget_kcal != null) {
    const yazioByDate = new Map(yazioHistory.map(d => [d.date, d]))
    const manualByDate = new Map<string, KostFoodEntry[]>()
    for (const e of entries) {
      const key = e.logged_at.slice(0, 10)
      if (!manualByDate.has(key)) manualByDate.set(key, [])
      manualByDate.get(key)!.push(e)
    }
    const rollingDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${todayKey}T00:00:00`)
      d.setDate(d.getDate() - (6 - i))
      return d.toISOString().slice(0, 10)
    })
    const dayEntries = rollingDays.map(dateKey => {
      const day = resolveDayNutrition(dateKey, yazioByDate, manualByDate, trackedMeals, new Set(dayOverrides))
      return { eatenKcal: day.eatenKcal, isComplete: day.isComplete }
    })
    const weekAvg = compute7DayAverage(dayEntries, profile.deficit_budget_kcal)
    if (weekAvg.avgDiffKcal != null) deficitSummary = { avgDiffKcal: weekAvg.avgDiffKcal, budgetKcal: profile.deficit_budget_kcal }
  }

  const insightsRaw = (insightsRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const kostReview = insightsRaw ? (() => {
    try {
      const parsed = JSON.parse(insightsRaw) as { generatedAt: string; agents?: { kostWeek?: string; kostGeneral?: string } }
      if (!parsed.agents?.kostWeek && !parsed.agents?.kostGeneral) return null
      return { generatedAt: parsed.generatedAt, kostWeek: parsed.agents.kostWeek ?? '', kostGeneral: parsed.agents.kostGeneral ?? '' }
    } catch { return null }
  })() : null

  return (
    <FoodLogClient
      dailyCalorieGoal={profile?.daily_calorie_goal ?? null}
      entries={entries}
      quickPicks={quickPicks}
      yazioHistory={yazioHistory}
      todayKey={todayKey}
      kostSettings={kostSettings}
      dayOverrides={dayOverrides}
      deficitSummary={deficitSummary}
      kostReview={kostReview}
    />
  )
}
