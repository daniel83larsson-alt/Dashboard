// I/O layer for the MCP tools — same shape as viktmal/page.tsx's own fetch
// block (the page this data is meant to never disagree with), just taking
// a userId directly instead of reading it off a cookie session, since an
// MCP request has no Supabase session to read one from.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeYazioDay, type YazioDay } from '@/lib/yazio-history'
import { KOST_MEALS, type KostMeal, type KostFoodEntry } from '@/lib/kost'

export type McpProfile = {
  deficit_tracking_enabled: boolean | null
  deficit_start_weight_kg: number | null
  deficit_start_date: string | null
  deficit_target_weight_kg: number | null
  deficit_target_date: string | null
  deficit_tdee_kcal: number | null
  deficit_budget_kcal: number | null
  daily_calorie_goal: number | null
  protein_goal_g: number | null
  kost_tracked_meals: string[] | null
}

export type McpMeasurement = { date: string; weightKg: number | null; waistCm: number | null }

export type McpUserData = {
  profile: McpProfile | null
  yazioByDate: Map<string, YazioDay>
  manualByDate: Map<string, KostFoodEntry[]>
  dayOverrides: Set<string>
  trackedMeals: KostMeal[]
  measurements: McpMeasurement[]
}

// foodLogWindowStartKey: the earliest date (YYYY-MM-DD) any tool calling
// this needs food_log/kost_day_status rows for — callers pass the widest
// window they need for a single call, same "fetch wide, slice per tool"
// principle viktmal/page.tsx uses for its 7- vs 14-day windows.
export async function fetchMcpUserData(
  supabase: SupabaseClient,
  userId: string,
  todayKey: string,
  foodLogWindowStartKey: string,
): Promise<McpUserData> {
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('deficit_tracking_enabled, deficit_start_weight_kg, deficit_start_date, deficit_target_weight_kg, deficit_target_date, deficit_tdee_kcal, deficit_budget_kcal, daily_calorie_goal, protein_goal_g, kost_tracked_meals')
    .eq('id', userId)
    .single()
  const profile = (profileRow ?? null) as McpProfile | null

  // waist_change_since_start_cm needs the goal's whole history, not just
  // the food-log window — anchored to deficit_start_date (a date far
  // enough in the past when no goal is set yet, rather than a fixed
  // lookback) so an old goal's baseline measurement is never silently cut
  // off the way a fixed N-day lookback would.
  const measurementsSinceKey = profile?.deficit_start_date ?? '2000-01-01'
  const sinceIso = new Date(`${foodLogWindowStartKey}T00:00:00`).toISOString()

  const [{ data: foodLog }, { data: yazioHistoryRow }, { data: dayStatusRows }, { data: measurementRows }] = await Promise.all([
    supabase.from('food_log').select('id, name, calories, protein_g, carb_g, fat_g, meal, source, logged_at')
      .eq('user_id', userId).gte('logged_at', sinceIso),
    supabase.from('coach_sessions').select('messages').eq('user_id', userId).eq('coach_id', 'yazio_history').single(),
    supabase.from('kost_day_status').select('date').eq('user_id', userId).eq('status', 'complete')
      .gte('date', foodLogWindowStartKey).lte('date', todayKey),
    supabase.from('body_measurements').select('measured_on, weight_kg, waist_cm')
      .eq('user_id', userId).gte('measured_on', measurementsSinceKey).order('measured_on', { ascending: true }),
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
  const trackedMeals = ((profile?.kost_tracked_meals as string[] | null) ?? ['breakfast', 'lunch', 'dinner'])
    .filter((m): m is KostMeal => (KOST_MEALS as string[]).includes(m))

  const measurements: McpMeasurement[] = (measurementRows ?? []).map(r => ({
    date: r.measured_on as string,
    weightKg: r.weight_kg as number | null,
    waistCm: r.waist_cm as number | null,
  }))

  return { profile, yazioByDate, manualByDate, dayOverrides, trackedMeals, measurements }
}
