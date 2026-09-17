import { createSupabaseServerClient } from '@/lib/supabase-server'
import FoodLogClient, { type QuickPick, type FoodEntry, type KostSettings } from '@/components/FoodLogClient'
import { stockholmDateKey } from '@/lib/dates'
import { normalizeYazioDay, type YazioDay } from '@/lib/yazio-history'
import { KOST_METRICS, KOST_MEALS, type KostMetric, type KostMeal, type KostFoodEntry } from '@/lib/kost'
import { resolveDayNutrition } from '@/lib/day-nutrition-source'
import { compute7DayAverage, budgetInForceOn } from '@/lib/deficit'
import { estimateBMR } from '@/lib/bmr'
import { dedupeForStats } from '@/lib/duplicates'
import { resolveEffectiveCalorieGoal } from '@/lib/calorie-goal'

// 90 dagar bak i tiden räcker för vecka/månad-vyerna utan att hämta hela
// historiken varje sidladdning.
const ENTRY_LOOKBACK_DAYS = 90

export default async function MatPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const sinceIso = new Date(new Date().getTime() - ENTRY_LOOKBACK_DAYS * 86400000).toISOString()

  const [{ data: profile }, { data: recentLog }, { data: quickPicksRaw }, { data: yazioHistoryRow }, { data: dayStatusRows }, { data: dayNoteRows }, { data: recentActivitiesRaw }, { data: wellnessRow }, { data: budgetEventRows }] = await Promise.all([
    supabase.from('profiles').select('daily_calorie_goal, kost_tracking_enabled, kost_tracked_metrics, kost_tracked_meals, kost_reminders_enabled, protein_goal_g, carb_goal_g, fat_goal_g, deficit_tracking_enabled, deficit_budget_kcal, deficit_garmin_correction, kost_evening_guard_enabled, kost_evening_guard_hour, weight_kg, height_cm, birth_year, biological_sex').eq('id', user.id).single(),
    supabase.from('food_log').select('*').eq('user_id', user.id).gte('logged_at', sinceIso).order('logged_at', { ascending: false }),
    supabase.rpc('food_quick_picks'),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_history').single(),
    supabase.from('kost_day_status').select('date').eq('user_id', user.id).eq('status', 'complete'),
    supabase.from('day_context_notes').select('date, tag, note').eq('user_id', user.id).gte('date', sinceIso.slice(0, 10)),
    // För "totalt förbränt"-kolumnen i dagslistorna nedan (Daniel: "smidigt
    // om totalt förbränt loggades där med"). Samma smala kolumnval och
    // dedupeForStats-hantering som dashboard/page.tsx redan använder — ett
    // Garmin+Concept2-synkat pass ska bara räknas en gång.
    supabase.from('activities').select('id, strava_id, source, sport_type, start_date, distance, moving_time, calories').eq('user_id', user.id).gte('start_date', sinceIso),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    // Reconstructs which budget was actually in force on each day for the
    // header link below (Daniel: "egentligen ska inte de ändras
    // retroaktivt") instead of assuming today's current budget applied.
    supabase.from('deficit_budget_events')
      .select('created_at, new_budget_kcal')
      .eq('user_id', user.id).order('created_at', { ascending: true }),
  ])
  const budgetEvents = (budgetEventRows ?? []).map(r => ({ createdAt: r.created_at as string, newBudgetKcal: r.new_budget_kcal as number | null }))

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

  // Viktmåls uträknade budget vinner över det fristående manuella fältet
  // när båda finns (Daniel: "man bör väl säga vilken som är viktigast att
  // följa" — se lib/calorie-goal.ts). Samma resolverade tal används både
  // här och på Översikt, så de aldrig visar olika mål.
  const effectiveCalorieGoal = resolveEffectiveCalorieGoal({
    dailyCalorieGoal: profile?.daily_calorie_goal ?? null,
    deficitTrackingEnabled: profile?.deficit_tracking_enabled ?? false,
    deficitBudgetKcal: profile?.deficit_budget_kcal ?? null,
  })

  const kostSettings: KostSettings = {
    trackingEnabled: profile?.kost_tracking_enabled ?? false,
    trackedMetrics,
    trackedMeals,
    calorieGoal: effectiveCalorieGoal.kcal,
    proteinGoalG: profile?.protein_goal_g ?? null,
    carbGoalG: profile?.carb_goal_g ?? null,
    fatGoalG: profile?.fat_goal_g ?? null,
    eveningGuardEnabled: profile?.kost_evening_guard_enabled ?? false,
    eveningGuardHour: profile?.kost_evening_guard_hour ?? 20,
  }

  // Förbränt-kolumnen i dagslistorna (Daniel: "smidigt om totalt förbränt
  // loggades där med"). Samma modell som Översikts "Kalorier idag"-kort:
  // Garmins uppmätta dygnstotal när den finns, annars BMR + den dagens
  // träning (dedupeForStats säkerställer att ett Garmin+Concept2-synkat
  // pass inte räknas dubbelt — samma bugg vi nyss fixade i vänners
  // träningspass). Räknas per-dag i klienten (estimateBurnedKcalForDay) —
  // här skickas bara de tre råa ingredienserna ner.
  const bmrKcal = estimateBMR({
    weightKg: profile?.weight_kg ?? null,
    heightCm: profile?.height_cm ?? null,
    birthYear: profile?.birth_year ?? null,
    biologicalSex: profile?.biological_sex ?? null,
  }).bmr

  type ActivityForCalories = { start_date: string; calories: number | null; id: string; strava_id: number; source?: string; sport_type: string; distance: number; moving_time: number }
  const dedupedActivities = dedupeForStats((recentActivitiesRaw ?? []) as ActivityForCalories[])
  const activityKcalByDate: Record<string, number> = {}
  // Manuellt loggade pass (source='manual', t.ex. "Logga pass" — kettlebell
  // är svårt att ha klockan på för) är per definition inte med i Garmins
  // dygnstotal, så de läggs alltid ovanpå den istället för att ersättas av
  // den — se estimateBurnedKcalForDay/estimateBurnedKcalForStatus.
  const manualActivityKcalByDate: Record<string, number> = {}
  for (const a of dedupedActivities) {
    const key = a.start_date.slice(0, 10)
    activityKcalByDate[key] = (activityKcalByDate[key] ?? 0) + (a.calories ?? 0)
    if (a.source === 'manual') {
      manualActivityKcalByDate[key] = (manualActivityKcalByDate[key] ?? 0) + (a.calories ?? 0)
    }
  }

  type DayWellness = { date: string; totalCalories: number | null; activeCalories: number | null }
  const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const wellnessHistory: DayWellness[] = wellnessRaw ? (() => {
    try {
      const parsed = JSON.parse(wellnessRaw) as { history?: DayWellness[] }
      return Array.isArray(parsed.history) ? parsed.history : []
    } catch { return [] }
  })() : []
  const garminTotalCaloriesByDate: Record<string, number> = {}
  const garminActiveCaloriesByDate: Record<string, number> = {}
  for (const w of wellnessHistory) {
    if (w.totalCalories != null) garminTotalCaloriesByDate[w.date] = w.totalCalories
    if (w.activeCalories != null) garminActiveCaloriesByDate[w.date] = w.activeCalories
  }

  // Samma försiktighetsprincip som Viktmåls egen budget (Daniel: "bra att
  // se det med försiktighet... så jag inte tummar på budgeten") — bara
  // träningsdelen av Garmins dygnstotal rabatteras med samma faktor, se
  // lib/burned-calories.ts's estimateBurnedKcalForStatus.
  const garminCorrection = profile?.deficit_garmin_correction ?? 0.75

  const dayNotes = (dayNoteRows ?? []) as { date: string; tag: string | null; note: string | null }[]

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
      return { eatenKcal: day.eatenKcal, isComplete: day.isComplete, budgetKcal: budgetInForceOn(dateKey, profile.deficit_budget_kcal!, budgetEvents) }
    })
    const weekAvg = compute7DayAverage(dayEntries)
    if (weekAvg.avgDiffKcal != null) deficitSummary = { avgDiffKcal: weekAvg.avgDiffKcal, budgetKcal: profile.deficit_budget_kcal }
  }

  return (
    <FoodLogClient
      dailyCalorieGoal={effectiveCalorieGoal.kcal}
      calorieGoalSource={effectiveCalorieGoal.source}
      entries={entries}
      quickPicks={quickPicks}
      yazioHistory={yazioHistory}
      todayKey={todayKey}
      kostSettings={kostSettings}
      dayOverrides={dayOverrides}
      deficitSummary={deficitSummary}
      dayNotes={dayNotes}
      bmrKcal={bmrKcal}
      activityKcalByDate={activityKcalByDate}
      manualActivityKcalByDate={manualActivityKcalByDate}
      garminTotalCaloriesByDate={garminTotalCaloriesByDate}
      garminActiveCaloriesByDate={garminActiveCaloriesByDate}
      garminCorrection={garminCorrection}
    />
  )
}
