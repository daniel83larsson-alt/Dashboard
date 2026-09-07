import { createSupabaseServerClient } from '@/lib/supabase-server'
import { stockholmDateKey } from '@/lib/dates'
import { normalizeYazioDay, type YazioDay } from '@/lib/yazio-history'
import { KOST_MEALS, type KostMeal, type KostFoodEntry } from '@/lib/kost'
import { resolveDayNutrition } from '@/lib/day-nutrition-source'
import { compute7DayAverage, MAX_SAFE_DEFICIT_KCAL } from '@/lib/deficit'

const ROLLING_WINDOW_DAYS = 7

// Deliberately its own self-fetching server component rather than threaded
// through dashboard/page.tsx's own big Promise.all — that file is already
// perf-sensitive (see its own comments on narrowed selects), and keeping
// this card's fetch + lib/deficit import fully separate is also what lets
// route-invariants.test.ts mechanically prove dashboard/page.tsx itself
// never touches the Garmin correction factor or anything deficit-related.
export default async function ViktmalOverviewCard() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('deficit_tracking_enabled, deficit_budget_kcal, deficit_tdee_kcal, deficit_target_weight_kg, deficit_target_date, kost_tracked_meals')
    .eq('id', user.id)
    .single()

  // Innan detta kort visade ingenting alls här om Viktmål inte var påslaget
  // — till skillnad från kalori-kortet på samma sida, som redan hade en
  // matchande "Sätt ett kalorimål"-CTA. Daniel: sidan ska kännas lika
  // komplett oavsett vilka valfria funktioner man använder.
  if (!profile?.deficit_tracking_enabled || profile.deficit_budget_kcal == null) {
    return (
      <a href="/dashboard/profil" className="bg-card border border-edge rounded-2xl p-4 block hover:border-accent/30 transition-colors">
        <div className="text-sm font-medium">🎯 Sätt upp ett viktmål</div>
        <div className="text-muted text-xs mt-1">Sätt en målvikt och ett datum så räknar vi ut en fast daglig kaloribudget istället för att gissa.</div>
      </a>
    )
  }

  const todayKey = stockholmDateKey()
  const days = Array.from({ length: ROLLING_WINDOW_DAYS }, (_, i) => {
    const d = new Date(`${todayKey}T00:00:00`)
    d.setDate(d.getDate() - (ROLLING_WINDOW_DAYS - 1 - i))
    return d.toISOString().slice(0, 10)
  })
  const sinceIso = new Date(`${days[0]}T00:00:00`).toISOString()

  const [{ data: foodLog }, { data: yazioHistoryRow }, { data: dayStatusRows }] = await Promise.all([
    supabase.from('food_log').select('id, name, calories, protein_g, carb_g, fat_g, meal, source, logged_at')
      .eq('user_id', user.id).gte('logged_at', sinceIso),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_history').single(),
    supabase.from('kost_day_status').select('date').eq('user_id', user.id).eq('status', 'complete')
      .gte('date', days[0]).lte('date', todayKey),
  ])

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

  const dayEntries = days.map(dateKey => {
    const day = resolveDayNutrition(dateKey, yazioByDate, manualByDate, trackedMeals, dayOverrides)
    return { eatenKcal: day.eatenKcal, isComplete: day.isComplete }
  })
  const weekAvg = compute7DayAverage(dayEntries, profile.deficit_budget_kcal)

  // Same conversion as the full Viktmål page (ViktmalClient) — the raw
  // eaten-vs-BUDGET number reads as "kcal under the target" and gets
  // confused with the actual TDEE-relative deficit shown as "mål" there.
  // Converting onto the same axis here too keeps the two cards consistent
  // instead of only fixing one of them.
  const targetDeficitKcal = profile.deficit_tdee_kcal != null ? profile.deficit_tdee_kcal - profile.deficit_budget_kcal : null
  const weekActualDeficitKcal = targetDeficitKcal != null && weekAvg.avgDiffKcal != null
    ? targetDeficitKcal - weekAvg.avgDiffKcal
    : null
  const cardColor = weekActualDeficitKcal == null
    ? 'text-accent'
    : weekActualDeficitKcal > MAX_SAFE_DEFICIT_KCAL ? 'text-red-400'
    : weekActualDeficitKcal <= 0 ? 'text-amber-400'
    : 'text-green-400'

  return (
    <a href="/dashboard/viktmal" className="bg-card border border-edge rounded-2xl p-4 block hover:border-accent/30 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted uppercase tracking-wider">🎯 Viktmål</div>
        <span className="text-xs text-accent">Öppna →</span>
      </div>
      {weekAvg.avgDiffKcal != null ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className={`font-mono ${cardColor} text-2xl font-bold`}>
              {weekActualDeficitKcal != null
                ? (weekActualDeficitKcal >= 0 ? `−${weekActualDeficitKcal}` : `+${Math.abs(weekActualDeficitKcal)}`)
                : (weekAvg.avgDiffKcal > 0 ? '+' : '') + weekAvg.avgDiffKcal}
            </span>
            <span className="text-muted text-xs">kcal/dag, 7-dagars snitt</span>
          </div>
          <div className="text-muted text-xs mt-2">
            {weekAvg.completeDays} av 7 dagar färdigloggade
            {targetDeficitKcal != null ? ` · mål −${targetDeficitKcal} kcal/dag` : ` mot budgeten på ${profile.deficit_budget_kcal} kcal`}
          </div>
        </>
      ) : (
        <div className="text-muted text-xs">Logga några dagar till ({weekAvg.completeDays} av minst 4) så visas ditt snitt här.</div>
      )}
    </a>
  )
}
