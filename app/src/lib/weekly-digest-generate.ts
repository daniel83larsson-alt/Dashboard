// Wraps the pure computation in lib/weekly-digest.ts with the one thing it
// deliberately doesn't do: talk to Gemini and persist the result. Shared by
// the interactive "generate now" route (step 2) and, later, the Sunday cron
// (step 4) — the cron calls this directly with an admin client instead of
// going through HTTP, and does NOT run this behind checkAndConsumeRateLimit
// (that limiter protects the shared key from INTERACTIVE bursts; a bounded,
// once-a-week-per-user scheduled job is a different kind of load and is
// throttled separately in the cron route itself).
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeWeeklyDigest, recapWeekStart, type WeeklyDigestData, type PlanSessionRow } from './weekly-digest'
import { decryptMaybeLegacy } from './encrypt'
import type { ActivityRow } from './duplicates'
import type { DayWellness } from './garmin-sync'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

export type WeeklyDigestRecord = {
  generatedAt: string
  weekStartISO: string
  weekEndISO: string
  data: WeeklyDigestData
  // null means the AI call failed — the record still holds real computed
  // numbers, so the card/email fall back to showing those without a written
  // paragraph rather than skipping the user entirely.
  narrative: string | null
  // Set when the Veckoplan page renders this record — drives the "new
  // recap ready" badge on Översikt (badge shows while viewedAt is null or
  // older than generatedAt, i.e. a fresh cron-generated digest hasn't been
  // opened yet). Always null right after generation.
  viewedAt: string | null
}

function fmtKm(km: number): string {
  return `${km.toFixed(1)} km`
}

function sportBreakdown(bySport: WeeklyDigestData['thisWeek']['sessions']['bySport']): string {
  if (!bySport.length) return 'inga pass'
  return bySport.map(s => `${s.count}x ${s.label}`).join(', ')
}

function buildPrompt(data: WeeklyDigestData, goalTitle: string | null): string {
  const w = data.thisWeek
  const p = data.prevWeek
  const fmtAvg = (v: number | null, unit: string, decimals = 0) => v == null ? 'saknas' : `${v.toFixed(decimals)}${unit}`

  const lookAheadLine = data.lookAhead.kind === 'plan'
    ? `Nästa veckas plan finns redan: ${data.lookAhead.sessions.filter(s => !s.isRest).map(s => s.label).join(', ') || 'bara vila'}.`
    : 'Nästa veckas plan är inte genererad än — ge en kort riktning för nästa vecka baserat på målet och veckans rytm istället.'

  return `DENNA VECKA (${data.weekStartISO} till ${data.weekEndISO}): ${w.sessions.count} pass, ${fmtKm(w.sessions.totalKm)}, ${w.sessions.totalMinutes} min. Fördelning: ${sportBreakdown(w.sessions.bySport)}.
FÖRRA VECKAN: ${p.sessions.count} pass, ${fmtKm(p.sessions.totalKm)}.
FÖLJSAMHET MOT PLANEN: ${data.adherence ? data.adherence.label : 'ingen plan var satt denna vecka'}
STEG: snitt ${fmtAvg(w.wellness.avgSteps, '')} (förra veckan ${fmtAvg(p.wellness.avgSteps, '')})
SÖMN: snitt ${fmtAvg(w.wellness.avgSleepHours, 'h', 1)} (förra veckan ${fmtAvg(p.wellness.avgSleepHours, 'h', 1)})
VILOPULS: snitt ${fmtAvg(w.wellness.avgRestingHR, ' bpm')} (förra veckan ${fmtAvg(p.wellness.avgRestingHR, ' bpm')})
MÅL: ${goalTitle ?? 'inget aktivt mål'}
${lookAheadLine}

Skriv "Veckans Recap" — en kort, personlig helhetsbild av veckan som gick, som ett litet nyhetsbrev med atletens egna siffror. Max 4 korta meningar, svenska, andra person ("du"), gå rakt på sak utan hälsningsfras eller avslutande fråga. Nämn minst en konkret siffra från datan ovan. Avsluta med en kort mening om vad nästa vecka innebär.`
}

async function generateNarrative(apiKey: string, data: WeeklyDigestData, goalTitle: string | null): Promise<string> {
  const system = 'Du är atletens huvudcoach som skriver veckans personliga sammanfattning. Svara ENDAST med den färdiga texten, ingen rubrik, inga citattecken runt om.'
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(data, goalTitle) }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  const d = await res.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text
  if (!res.ok || !text) throw new Error(`Gemini call failed: ${d.error?.message ?? res.status}`)
  return (text as string).trim()
}

export async function generateWeeklyDigestForUser(
  supabase: SupabaseClient,
  userId: string,
  opts?: { now?: Date }
): Promise<WeeklyDigestRecord> {
  const weekStart = recapWeekStart(opts?.now ?? new Date())
  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)
  const historyStart = new Date(weekStart)
  historyStart.setDate(historyStart.getDate() - 7)

  const [{ data: profile }, { data: goals }, { data: acts }, { data: wellnessRow }, { data: thisPlan }, { data: nextPlan }] = await Promise.all([
    supabase.from('profiles').select('llm_api_key_encrypted').eq('id', userId).single(),
    supabase.from('goals').select('title').eq('user_id', userId).eq('status', 'active').limit(1),
    supabase.from('activities').select('id, strava_id, start_date, distance, moving_time, sport_type')
      .eq('user_id', userId).gte('start_date', historyStart.toISOString()).lt('start_date', nextWeekStart.toISOString()),
    supabase.from('coach_sessions').select('messages').eq('user_id', userId).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('training_plans').select('id, plan_sessions(planned_date, is_rest, sport_type, title)')
      .eq('user_id', userId).eq('week_start', weekStart.toISOString().slice(0, 10)).maybeSingle(),
    supabase.from('training_plans').select('id, plan_sessions(planned_date, is_rest, sport_type, title)')
      .eq('user_id', userId).eq('week_start', nextWeekStart.toISOString().slice(0, 10)).maybeSingle(),
  ])

  const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const wellnessStore = wellnessRaw ? (() => { try { return JSON.parse(wellnessRaw) } catch { return null } })() : null
  const wellnessHistory: DayWellness[] = wellnessStore?.history ?? []

  const digestData = computeWeeklyDigest({
    weekStart,
    activities: (acts ?? []) as ActivityRow[],
    wellnessHistory,
    planSessionsThisWeek: (thisPlan?.plan_sessions ?? []) as PlanSessionRow[],
    planSessionsNextWeek: (nextPlan?.plan_sessions ?? []) as PlanSessionRow[],
  })

  const apiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : process.env.GEMINI_API_KEY!
  const goalTitle = (goals?.[0]?.title as string | undefined) ?? null

  let narrative: string | null = null
  try {
    narrative = await generateNarrative(apiKey, digestData, goalTitle)
  } catch (err) {
    console.error('Weekly digest narrative failed for user', userId, err)
  }

  const record: WeeklyDigestRecord = {
    generatedAt: new Date().toISOString(),
    weekStartISO: digestData.weekStartISO,
    weekEndISO: digestData.weekEndISO,
    data: digestData,
    narrative,
    viewedAt: null,
  }

  await supabase.from('coach_sessions').upsert({
    user_id: userId,
    coach_id: 'weekly_digest',
    messages: [{ role: 'system', content: JSON.stringify(record) }],
    updated_at: record.generatedAt,
  }, { onConflict: 'user_id,coach_id' })

  return record
}
