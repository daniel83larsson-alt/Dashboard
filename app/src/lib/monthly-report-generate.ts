// Wraps the pure computation in lib/monthly-report.ts with the one thing it
// deliberately doesn't do: talk to Gemini and persist the result. Mirrors
// weekly-digest-generate.ts's shape closely on purpose — same call sites
// pattern is expected once a real monthly cron exists, this is currently
// only called from the admin test-send route (Daniel: "vill testa på mig
// själv först" — no cron wired up yet, see STATUS.md).
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeMonthlyReport, recapMonthStart, monthDateKeys, summarizeMonthlyKost,
  type MonthlyReportData, type MonthlyKostData,
} from './monthly-report'
import { normalizeYazioDay, type YazioDay } from './yazio-history'
import { resolveDayNutrition, resolveDayProteinG } from './day-nutrition-source'
import { compute7DayAverage } from './deficit'
import { decryptMaybeLegacy } from './encrypt'
import { coachToneInstruction } from './coach-tone'
import type { ActivityRow } from './duplicates'
import type { DayWellness } from './garmin-sync'
import type { KostFoodEntry, KostMeal } from './kost'
import { resolveEffectiveCalorieGoal } from './calorie-goal'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

export type MonthlyReportInsights = {
  headline: string // en mening som sammanfattar hela månaden
  training: string
  wellnessAndSleep: string
  nutrition: string | null // null när ingen kost loggats alls denna månad
  habits: string | null // null när inga vanor loggats denna månad
  funFact: string // en rolig, konkret jämförelse byggd på FUNFACTS-siffrorna
}

export type MonthlyReportRecord = {
  generatedAt: string
  data: MonthlyReportData
  kost: MonthlyKostData | null
  // Samma engångs-genväg som Veckans Recap: använder BUDGETEN SOM GÄLLER NU
  // för varje dag i månaden istället för att återskapa vad som gällde
  // historiskt varje dag — rimligt för ett summerande mejl som skickas i
  // efterhand, se weekly-digest-generate.ts's egen kommentar om samma val.
  deficit: { avgDiffKcal: number; budgetKcal: number; completeDays: number } | null
  insights: MonthlyReportInsights | null
}

function fmtAvg(v: number | null, unit: string, decimals = 0): string {
  return v == null ? 'saknas' : `${v.toFixed(decimals)}${unit}`
}

function buildPrompt(data: MonthlyReportData, kost: MonthlyKostData | null, deficit: { avgDiffKcal: number; budgetKcal: number; completeDays: number } | null, goalTitle: string | null): string {
  const t = data.thisMonth
  const p = data.prevMonth

  const kostBlock = kost
    ? `\n\nKOST DENNA MÅNAD: ${kost.daysWithData} av ${kost.totalDaysInMonth} dagar loggade, snitt ${fmtAvg(kost.avgKcal, ' kcal')}${kost.kcalGoal != null ? ` (mål ${kost.kcalGoal} kcal)` : ''}${kost.avgProteinG != null ? `, protein snitt ${Math.round(kost.avgProteinG)}g${kost.proteinGoalG != null ? ` (mål ${kost.proteinGoalG}g)` : ''}` : ''}`
    : ''
  const deficitLine = deficit ? `\nVIKTMÅL DENNA MÅNAD: snitt ${deficit.avgDiffKcal > 0 ? '+' : ''}${deficit.avgDiffKcal} kcal/dag mot budgeten på ${deficit.budgetKcal} kcal (${deficit.completeDays} av ${data.thisMonth.sessions.count > 0 ? 'månadens' : ''} dagar färdigloggade)` : ''
  const weightLine = data.weight.startKg != null && data.weight.endKg != null
    ? `\nVIKT: ${data.weight.startKg.toFixed(1)} kg → ${data.weight.endKg.toFixed(1)} kg (${data.weight.changeKg! >= 0 ? '+' : ''}${data.weight.changeKg} kg denna månad)`
    : ''
  const habitsBlock = data.habits.length
    ? `\n\nVANOR DENNA MÅNAD:\n${data.habits.map(h => `${h.title}: ${h.doneDays} dagar`).join('\n')}`
    : ''
  const newRecordsLine = data.newRecords.length
    ? data.newRecords.map(r => `${r.label} ${r.startDate.slice(0, 10)}: ${r.records.join(', ')}`).join('; ')
    : 'inga'

  return `TRÄNING DENNA MÅNAD (${data.monthStartISO} till ${data.monthEndISO}):
Totalt: ${t.sessions.count} pass, ${t.sessions.totalKm} km, ${t.sessions.totalMinutes} min.
Fördelning: ${t.sessions.bySport.map(s => `${s.label} x${s.count} (${s.km} km)`).join(', ') || 'inga pass'}
Förra månaden: ${p.sessions.count} pass, ${p.sessions.totalKm} km.
BÄSTA PASSET: ${data.bestSession ? `${data.bestSession.label}, ${data.bestSession.distanceKm} km, ${data.bestSession.minutes} min (${data.bestSession.startDate.slice(0, 10)})` : 'inget pass denna månad'}
NYA REKORD: ${newRecordsLine}
STEG: snitt ${fmtAvg(t.wellness.avgSteps, '')}/dag (förra månaden ${fmtAvg(p.wellness.avgSteps, '')})
SÖMN: snitt ${fmtAvg(t.wellness.avgSleepHours, 'h', 1)} (förra månaden ${fmtAvg(p.wellness.avgSleepHours, 'h', 1)})
VILOPULS: snitt ${fmtAvg(t.wellness.avgRestingHR, ' bpm')} (förra månaden ${fmtAvg(p.wellness.avgRestingHR, ' bpm')})
MÅL: ${goalTitle ?? 'inget aktivt mål satt'}${weightLine}${kostBlock}${deficitLine}${habitsBlock}

FUNFACTS (använd EXAKT dessa siffror, hitta inte på egna): totalt ${data.funFacts.totalActiveMinutes} aktiva minuter, längsta passet ${data.funFacts.longestSessionKm ?? 0} km, mest aktiva veckodag var ${data.funFacts.mostActiveWeekday ?? 'ingen tydlig'}.

Skriv en personlig, peppig men konkret sammanfattning av HELA MÅNADEN ovan, ett fält per del. Aldrig floskler utan en siffra bakom — varje del ska nämna minst en konkret siffra från datan ovan.

headline: EN mening som fångar månaden som helhet (t.ex. bästa/tuffaste/mest konsekventa månaden, beroende på vad datan faktiskt visar).

training: 2-3 meningar om träningsmånaden — volym, fördelning mellan sporter, jämförelse mot förra månaden, och nämn NYA REKORD om det finns något.

wellnessAndSleep: 1-2 meningar om steg/sömn/vilopuls-mönstret och hur det jämför mot förra månaden.

funFact: EN rolig, konkret jämförelse byggd på FUNFACTS-siffrorna ovan (t.ex. omvandla totalt antal aktiva minuter eller längsta passet till något vardagligt och roligt att jämföra med — en filmlängd, en bilresa, ett välkänt avstånd). Hitta ALDRIG på egna siffror, använd bara de som givits.${kost ? '\n\nnutrition: 1-2 meningar om kost-månaden ovan — nämn en konkret siffra (kcal, protein, loggningsgrad).' : ''}${data.habits.length ? '\n\nhabits: 1 mening som lyfter fram den vana som hölls bäst denna månad.' : ''}

${coachToneInstruction(undefined)}`
}

async function generateInsights(apiKey: string, data: MonthlyReportData, kost: MonthlyKostData | null, deficit: { avgDiffKcal: number; budgetKcal: number; completeDays: number } | null, goalTitle: string | null, coachTone: string | null | undefined): Promise<MonthlyReportInsights> {
  const system = `Du är atletens huvudcoach som skriver en större månadssammanfattning. Svara ENDAST med JSON enligt schema.
${coachToneInstruction(coachTone)}`
  const properties: Record<string, { type: string }> = {
    headline: { type: 'STRING' },
    training: { type: 'STRING' },
    wellnessAndSleep: { type: 'STRING' },
    funFact: { type: 'STRING' },
  }
  const required = ['headline', 'training', 'wellnessAndSleep', 'funFact']
  if (kost) { properties.nutrition = { type: 'STRING' }; required.push('nutrition') }
  if (data.habits.length) { properties.habits = { type: 'STRING' }; required.push('habits') }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(data, kost, deficit, goalTitle) }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        maxOutputTokens: 800,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties, required },
      },
    }),
  })
  const d = await res.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text
  if (!res.ok || !text) throw new Error(`Gemini call failed: ${d.error?.message ?? res.status}`)
  const parsed = JSON.parse(text) as MonthlyReportInsights
  return {
    ...parsed,
    nutrition: kost ? (parsed.nutrition ?? null) : null,
    habits: data.habits.length ? (parsed.habits ?? null) : null,
  }
}

export async function generateMonthlyReportForUser(
  supabase: SupabaseClient,
  userId: string,
  opts?: { now?: Date }
): Promise<MonthlyReportRecord> {
  const monthStart = recapMonthStart(opts?.now ?? new Date())
  const monthEndExclusive = new Date(monthStart)
  monthEndExclusive.setMonth(monthEndExclusive.getMonth() + 1)
  const monthKeys = monthDateKeys(monthStart)
  const monthStartKey = monthKeys[0]

  // Full history (not just this month) — bestSession/newRecords need
  // everything before this month to know what counts as a "best" or a
  // broken record, same reasoning as weekly-digest-generate.ts.
  const [
    { data: profile }, { data: goals }, { data: acts }, { data: wellnessRow },
    { data: yazioHistoryRow }, { data: manualFoodLog }, { data: dayStatusRows },
    { data: weightRows }, { data: habitsRows }, { data: habitLogRows },
  ] = await Promise.all([
    supabase.from('profiles').select('name, llm_api_key_encrypted, coach_tone, kost_tracked_meals, daily_calorie_goal, protein_goal_g, deficit_tracking_enabled, deficit_budget_kcal').eq('id', userId).single(),
    supabase.from('goals').select('title').eq('user_id', userId).eq('status', 'active').limit(1),
    supabase.from('activities').select('id, strava_id, source, start_date, distance, moving_time, sport_type, average_heartrate, max_heartrate, calories')
      .eq('user_id', userId).lt('start_date', monthEndExclusive.toISOString()),
    supabase.from('coach_sessions').select('messages').eq('user_id', userId).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', userId).eq('coach_id', 'yazio_history').single(),
    supabase.from('food_log').select('id, name, calories, protein_g, carb_g, fat_g, meal, source, logged_at')
      .eq('user_id', userId).gte('logged_at', monthStart.toISOString()).lt('logged_at', monthEndExclusive.toISOString()),
    supabase.from('kost_day_status').select('date').eq('user_id', userId).eq('status', 'complete')
      .gte('date', monthStartKey).lt('date', monthEndExclusive.toISOString().slice(0, 10)),
    supabase.from('body_measurements').select('measured_on, weight_kg').eq('user_id', userId).not('weight_kg', 'is', null)
      .gte('measured_on', monthStartKey).lt('measured_on', monthEndExclusive.toISOString().slice(0, 10)),
    supabase.from('habits').select('id, title').eq('user_id', userId).eq('active', true),
    supabase.from('habit_logs').select('habit_id, done_date').eq('user_id', userId)
      .gte('done_date', monthStartKey).lt('done_date', monthEndExclusive.toISOString().slice(0, 10)),
  ])

  const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const wellnessStore = wellnessRaw ? (() => { try { return JSON.parse(wellnessRaw) } catch { return null } })() : null
  const wellnessHistory: DayWellness[] = wellnessStore?.history ?? []

  const activities = (acts ?? []) as ActivityRow[]
  const restingHR = wellnessHistory[0]?.restingHR ?? null
  const maxHR = activities.reduce((m, a) => (a.max_heartrate && a.max_heartrate > m ? a.max_heartrate : m), 0) || null

  const weightReadings = (weightRows ?? []).map(r => ({ date: r.measured_on as string, weightKg: r.weight_kg as number }))
  const habits = (habitsRows ?? []) as { id: string; title: string }[]
  const habitLogs = (habitLogRows ?? []) as { habit_id: string; done_date: string }[]

  const reportData = computeMonthlyReport({
    monthStart, activities, wellnessHistory, restingHR, maxHR, weightReadings, habits, habitLogs,
  })

  const apiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : process.env.GEMINI_API_KEY!
  const goalTitle = (goals?.[0]?.title as string | undefined) ?? null

  const yazioHistoryRaw = (yazioHistoryRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const yazioHistory: YazioDay[] = yazioHistoryRaw ? (() => {
    try {
      const parsed = JSON.parse(yazioHistoryRaw)
      return Array.isArray(parsed) ? parsed.map(normalizeYazioDay) : []
    } catch { return [] }
  })() : []
  const yazioByDate = new Map(yazioHistory.map(d => [d.date, d]))

  const manualByDate = new Map<string, KostFoodEntry[]>()
  for (const e of (manualFoodLog ?? []) as KostFoodEntry[]) {
    const key = e.logged_at.slice(0, 10)
    if (!manualByDate.has(key)) manualByDate.set(key, [])
    manualByDate.get(key)!.push(e)
  }
  const trackedMeals = (profile?.kost_tracked_meals as KostMeal[] | null) ?? []
  const dayOverrides = new Set((dayStatusRows ?? []).map(r => r.date as string))

  const dayNutritions = monthKeys.map(k => resolveDayNutrition(k, yazioByDate, manualByDate, trackedMeals, dayOverrides))
  const dayProteins = monthKeys.map(k => resolveDayProteinG(k, yazioByDate, manualByDate, trackedMeals, dayOverrides))
  const effectiveCalorieGoal = resolveEffectiveCalorieGoal({
    dailyCalorieGoal: profile?.daily_calorie_goal ?? null,
    deficitTrackingEnabled: profile?.deficit_tracking_enabled ?? false,
    deficitBudgetKcal: profile?.deficit_budget_kcal ?? null,
  })
  const kost = summarizeMonthlyKost(dayNutritions, dayProteins, effectiveCalorieGoal.kcal, profile?.protein_goal_g ?? null)

  let deficit: { avgDiffKcal: number; budgetKcal: number; completeDays: number } | null = null
  if (profile?.deficit_tracking_enabled && profile.deficit_budget_kcal != null) {
    const monthDays = dayNutritions.map(d => ({ eatenKcal: d.eatenKcal, isComplete: d.isComplete, budgetKcal: profile.deficit_budget_kcal! }))
    const avg = compute7DayAverage(monthDays)
    if (avg.avgDiffKcal != null) deficit = { avgDiffKcal: avg.avgDiffKcal, budgetKcal: profile.deficit_budget_kcal, completeDays: avg.completeDays }
  }

  let insights: MonthlyReportInsights | null = null
  try {
    insights = await generateInsights(apiKey, reportData, kost, deficit, goalTitle, profile?.coach_tone)
  } catch (err) {
    console.error('Monthly report insights failed for user', userId, err)
  }

  const record: MonthlyReportRecord = {
    generatedAt: new Date().toISOString(),
    data: reportData,
    kost,
    deficit,
    insights,
  }

  await supabase.from('coach_sessions').upsert({
    user_id: userId,
    coach_id: 'monthly_report',
    messages: [{ role: 'system', content: JSON.stringify(record) }],
    updated_at: record.generatedAt,
  }, { onConflict: 'user_id,coach_id' })

  return record
}
