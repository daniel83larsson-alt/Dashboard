// Wraps the pure computation in lib/weekly-digest.ts with the one thing it
// deliberately doesn't do: talk to Gemini and persist the result. Shared by
// the interactive "generate now" route (step 2) and, later, the Sunday cron
// (step 4) — the cron calls this directly with an admin client instead of
// going through HTTP, and does NOT run this behind checkAndConsumeRateLimit
// (that limiter protects the shared key from INTERACTIVE bursts; a bounded,
// once-a-week-per-user scheduled job is a different kind of load and is
// throttled separately in the cron route itself).
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeWeeklyDigest, recapWeekStart, activitiesInWeek, type WeeklyDigestData, type PlanSessionRow } from './weekly-digest'
import { decryptMaybeLegacy } from './encrypt'
import { sportLabel } from './sport'
import { coachToneInstruction } from './coach-tone'
import type { ActivityRow } from './duplicates'
import type { DayWellness } from './garmin-sync'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// Three short, distinct coach perspectives instead of one blended paragraph
// — Daniel's own feedback on the first real send: "inte så kul... hade velat
// ha lite insikter eller tips från coachen, om passen, steg och sömn, som
// peppar mot målet." Mirrors the same "specialist voices" idea already used
// by /api/insights/generate's coach team, condensed to one field per topic
// instead of six, since this is a weekly push, not an on-demand deep-dive.
export type WeeklyDigestInsights = {
  sessions: string // feedback specifically on the pass som kördes denna vecka
  wellness: string // insikt om steg + sömn-mönstret
  motivation: string // peppig, mål-kopplad rad om vad som väntar
}

export type WeeklyDigestRecord = {
  generatedAt: string
  weekStartISO: string
  weekEndISO: string
  data: WeeklyDigestData
  // null means the AI call failed — the record still holds real computed
  // numbers, so the card/email fall back to showing those without written
  // insights rather than skipping the user entirely.
  insights: WeeklyDigestInsights | null
  // Set when the Veckoplan page renders this record — drives the "new
  // recap ready" badge on Översikt (badge shows while viewedAt is null or
  // older than generatedAt, i.e. a fresh cron-generated digest hasn't been
  // opened yet). Always null right after generation.
  viewedAt: string | null
}

function fmtKm(km: number): string {
  return `${km.toFixed(1)} km`
}

// A dated one-line-per-session list — plain aggregate stats read as dry
// (Daniel's own complaint); giving the model the actual sessions lets it
// say something concrete about THIS week ("tre roddpass, tyngst på
// torsdagen") instead of a generic re-statement of the totals.
function sessionList(activities: ActivityRow[]): string {
  if (!activities.length) return 'Inga pass loggade denna vecka.'
  return activities
    .slice()
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map(a => {
      const day = new Date(a.start_date).toLocaleDateString('sv-SE', { weekday: 'short' })
      const km = a.distance > 0 ? `, ${(a.distance / 1000).toFixed(1)} km` : ''
      const min = Math.round(a.moving_time / 60)
      return `${day} ${sportLabel(a.sport_type)}${km}, ${min} min`
    })
    .join('\n')
}

// The week's PLANNED sessions, same one-line-per-session shape as
// sessionList() — feeding both lists to the model lets it reason in plain
// language about deviations ("tisdagens planerade intervaller blev en lugn
// distans") instead of needing a hand-built matching algorithm for workout
// TYPE (only sport+week is actually verified by plan-reconcile.ts; whether
// a session matched its intended character is deliberately left to the
// model's judgment here, per Daniel: volume matching is enough for the
// automatic checkmark, but the recap should still give constructive
// feedback on fit).
function planList(planned: PlanSessionRow[]): string {
  const nonRest = planned.filter(p => !p.is_rest)
  if (!nonRest.length) return 'Ingen plan var satt denna vecka.'
  return nonRest
    .slice()
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
    .map(p => {
      const day = new Date(p.planned_date).toLocaleDateString('sv-SE', { weekday: 'short' })
      return `${day} ${sportLabel(p.sport_type ?? '')}: ${p.title}`
    })
    .join('\n')
}

function buildPrompt(data: WeeklyDigestData, thisWeekActivities: ActivityRow[], planSessionsThisWeek: PlanSessionRow[], goalTitle: string | null): string {
  const w = data.thisWeek
  const p = data.prevWeek
  const fmtAvg = (v: number | null, unit: string, decimals = 0) => v == null ? 'saknas' : `${v.toFixed(decimals)}${unit}`

  const lookAheadLine = data.lookAhead.kind === 'plan'
    ? `Nästa veckas plan finns redan: ${data.lookAhead.sessions.filter(s => !s.isRest).map(s => s.label).join(', ') || 'bara vila'}.`
    : 'Nästa veckas plan är inte genererad än.'

  return `VECKANS PLAN (vad som var tänkt):
${planList(planSessionsThisWeek)}

DENNA VECKAS PASS (${data.weekStartISO} till ${data.weekEndISO}, vad som faktiskt kördes):
${sessionList(thisWeekActivities)}
TOTALT: ${w.sessions.count} pass, ${fmtKm(w.sessions.totalKm)}, ${w.sessions.totalMinutes} min. Förra veckan: ${p.sessions.count} pass, ${fmtKm(p.sessions.totalKm)}.
BÄSTA PASSET (högst träningsbelastning): ${data.bestSession ? `${data.bestSession.label}, ${fmtKm(data.bestSession.distanceKm)}, ${data.bestSession.minutes} min` : 'inget pass denna vecka'}
NYA REKORD DENNA VECKA: ${data.newRecords.length ? data.newRecords.map(r => `${r.label}: ${r.records.join(', ')}`).join('; ') : 'inga'}
FÖLJSAMHET MOT PLANEN: ${data.adherence ? data.adherence.label : 'ingen plan var satt denna vecka'}
STEG: snitt ${fmtAvg(w.wellness.avgSteps, '')}/dag (förra veckan ${fmtAvg(p.wellness.avgSteps, '')})
SÖMN: snitt ${fmtAvg(w.wellness.avgSleepHours, 'h', 1)} (förra veckan ${fmtAvg(p.wellness.avgSleepHours, 'h', 1)})
VILOPULS: snitt ${fmtAvg(w.wellness.avgRestingHR, ' bpm')} (förra veckan ${fmtAvg(p.wellness.avgRestingHR, ' bpm')})
MÅL: ${goalTitle ?? 'inget aktivt mål satt'}
${lookAheadLine}

Ge tre korta coach-perspektiv på veckan ovan, ett fält per roll. Skriv som en coach som faktiskt känner atleten, inte en generisk statistik-referat — peppigt och personligt, men alltid förankrat i en konkret siffra eller detalj från datan ovan, aldrig floskler som "bra jobbat" utan att säga varför.

sessions: Jämför VECKANS PLAN mot passen som faktiskt kördes. Om mängden/sporterna stämmer bra mot planen, säg det kort. Om något planerat pass avvek från vad som faktiskt kördes (t.ex. ett planerat intervallpass blev en lugn distans, eller fel sport/dag) — ge KONSTRUKTIV feedback på just den skillnaden, inte bara att volymen stämde. Nämn en specifik dag/pass, inte bara totalen. Om NYA REKORD DENNA VECKA innehåller något, fira det kort och konkret (vilket rekord, vilket pass) — det är alltid värt att nämna. Om ingen plan fanns denna vecka, kommentera bara passen som kördes. MAX 2 meningar.

wellness: Ett konkret, användbart tips utifrån steg- och sömnmönstret ovan (jämför med förra veckan om det säger något intressant). MAX 2 meningar.

motivation: En peppig, personlig mening om vad nästa vecka handlar om — koppla tydligt till MÅL ovan om ett finns, annars till att bygga en vana. MAX 2 meningar.`
}

async function generateInsights(apiKey: string, data: WeeklyDigestData, thisWeekActivities: ActivityRow[], planSessionsThisWeek: PlanSessionRow[], goalTitle: string | null, coachTone: string | null | undefined): Promise<WeeklyDigestInsights> {
  const system = `Du är atletens huvudcoach som skriver veckans personliga sammanfattning i tre korta delar. Svara ENDAST med JSON enligt schema.
${coachToneInstruction(coachTone)}`
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(data, thisWeekActivities, planSessionsThisWeek, goalTitle) }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        maxOutputTokens: 500,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            sessions: { type: 'STRING' },
            wellness: { type: 'STRING' },
            motivation: { type: 'STRING' },
          },
          required: ['sessions', 'wellness', 'motivation'],
        },
      },
    }),
  })
  const d = await res.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text
  if (!res.ok || !text) throw new Error(`Gemini call failed: ${d.error?.message ?? res.status}`)
  return JSON.parse(text) as WeeklyDigestInsights
}

export async function generateWeeklyDigestForUser(
  supabase: SupabaseClient,
  userId: string,
  opts?: { now?: Date }
): Promise<WeeklyDigestRecord> {
  const weekStart = recapWeekStart(opts?.now ?? new Date())
  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)

  // Full history (not just this week + prev week) — bestSession/newRecords
  // in computeWeeklyDigest need everything before this week to know what
  // counts as a "best" load or a broken personal record, same as the
  // Översikt/Rekord pages already fetch full history for the same reason.
  const [{ data: profile }, { data: goals }, { data: acts }, { data: wellnessRow }, { data: thisPlan }, { data: nextPlan }] = await Promise.all([
    supabase.from('profiles').select('llm_api_key_encrypted, coach_tone').eq('id', userId).single(),
    supabase.from('goals').select('title').eq('user_id', userId).eq('status', 'active').limit(1),
    supabase.from('activities').select('id, strava_id, source, start_date, distance, moving_time, sport_type, average_heartrate, max_heartrate')
      .eq('user_id', userId).lt('start_date', nextWeekStart.toISOString()),
    supabase.from('coach_sessions').select('messages').eq('user_id', userId).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('training_plans').select('id, plan_sessions(planned_date, is_rest, sport_type, title)')
      .eq('user_id', userId).eq('week_start', weekStart.toISOString().slice(0, 10)).maybeSingle(),
    supabase.from('training_plans').select('id, plan_sessions(planned_date, is_rest, sport_type, title)')
      .eq('user_id', userId).eq('week_start', nextWeekStart.toISOString().slice(0, 10)).maybeSingle(),
  ])

  const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const wellnessStore = wellnessRaw ? (() => { try { return JSON.parse(wellnessRaw) } catch { return null } })() : null
  const wellnessHistory: DayWellness[] = wellnessStore?.history ?? []

  const planSessionsThisWeek = (thisPlan?.plan_sessions ?? []) as PlanSessionRow[]
  const activities = (acts ?? []) as ActivityRow[]
  // Same source as the front page's own weekly load card (dashboard/page.tsx):
  // most recent known resting HR from wellness, personal max HR derived from
  // the user's own logged activities rather than a guessed constant.
  const restingHR = wellnessHistory[0]?.restingHR ?? null
  const maxHR = activities.reduce((m, a) => (a.max_heartrate && a.max_heartrate > m ? a.max_heartrate : m), 0) || null

  const digestData = computeWeeklyDigest({
    weekStart,
    activities,
    wellnessHistory,
    planSessionsThisWeek,
    planSessionsNextWeek: (nextPlan?.plan_sessions ?? []) as PlanSessionRow[],
    restingHR,
    maxHR,
  })

  const apiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : process.env.GEMINI_API_KEY!
  const goalTitle = (goals?.[0]?.title as string | undefined) ?? null
  const thisWeekActivities = activitiesInWeek((acts ?? []) as ActivityRow[], weekStart)

  let insights: WeeklyDigestInsights | null = null
  try {
    insights = await generateInsights(apiKey, digestData, thisWeekActivities, planSessionsThisWeek, goalTitle, profile?.coach_tone)
  } catch (err) {
    console.error('Weekly digest insights failed for user', userId, err)
  }

  const record: WeeklyDigestRecord = {
    generatedAt: new Date().toISOString(),
    weekStartISO: digestData.weekStartISO,
    weekEndISO: digestData.weekEndISO,
    data: digestData,
    insights,
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
