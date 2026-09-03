import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { startOfWeek } from '@/lib/dates'
import { checkAndConsumeRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { decryptMaybeLegacy } from '@/lib/encrypt'
import { fmtSpeedOrPace } from '@/lib/sport'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import { currentStepGoalStreak } from '@/lib/streaks'
import { dedupeForStats } from '@/lib/duplicates'
import { coachToneInstruction } from '@/lib/coach-tone'
import { stockholmDateKey } from '@/lib/dates'
import { normalizeYazioDay, type YazioDay } from '@/lib/yazio-history'
import { KOST_MEALS, type KostMeal, type KostFoodEntry } from '@/lib/kost'
import { buildNutritionSummary, formatNutritionForPrompt } from '@/lib/nutrition-summary'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

type AgentInsights = { data: string; sleep: string; steps: string; mental: string; strength: string; mobility: string; kostWeek: string; kostGeneral: string; summary: string }

// Single call producing all seven specialist perspectives + the head
// coach's summary in one structured response, instead of eight separate
// Gemini calls (one per specialist + one synthesis) — same shared quota, a
// fraction of the requests, at the cost of each perspective being generated
// in the same pass rather than fully independently.
async function askAgentTeam(apiKey: string, question: string, coachTone: string | null | undefined): Promise<AgentInsights> {
  const system = `Du är hela tränarteamet för en uthållighetsidrottare (rodd m.fl.): datadriven analytiker (fokus: helhetsdata + hur upplägget/målen går), sömncoach, stegcoach, mentalcoach, styrkecoach (kompletterande träning), rörlighets-/stretchcoach och kostcoach — plus huvudcoach som sammanfattar teamets bedömningar. Svara ENDAST med JSON enligt schema, ett fält per roll. Varje enskilt fält: MAX 2 korta meningar, svenska, konkret, gå direkt på sak, inga bisatser eller utfyllnadsord — utom "summary" som är huvudcoachens syntes i MAX 3 korta meningar (fetstil/punktlistor tillåtet där). Hellre en vass mening än två urvattnade.
${coachToneInstruction(coachTone)}`

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: question }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        maxOutputTokens: 1100,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            data: { type: 'STRING' },
            sleep: { type: 'STRING' },
            steps: { type: 'STRING' },
            mental: { type: 'STRING' },
            strength: { type: 'STRING' },
            mobility: { type: 'STRING' },
            kostWeek: { type: 'STRING' },
            kostGeneral: { type: 'STRING' },
            summary: { type: 'STRING' },
          },
          required: ['data', 'sleep', 'steps', 'mental', 'strength', 'mobility', 'kostWeek', 'kostGeneral', 'summary'],
        },
      },
    }),
  })
  const d = await res.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text
  if (!res.ok || !text) {
    throw new Error(`Gemini call failed: ${d.error?.message ?? res.status}`)
  }
  return JSON.parse(text) as AgentInsights
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })
    logApiCall(supabase, user.id, 'insights_generate')

    const foodSinceIso = new Date(Date.now() - 37 * 86400000).toISOString()

    const [{ data: profile }, { data: acts }, { data: goals }, { data: ctxRow }, { data: wellnessRow }, { data: overviewRow }, { data: foodLog }, { data: yazioHistoryRow }, { data: dayStatusRows }] = await Promise.all([
      supabase.from('profiles').select('name, llm_api_key_encrypted, home_equipment, selected_sports, daily_step_goal, coach_tone, kost_tracking_enabled, kost_tracked_meals, daily_calorie_goal, protein_goal_g, carb_goal_g, fat_goal_g, deficit_tracking_enabled, deficit_budget_kcal').eq('id', user.id).single(),
      supabase.from('activities').select('id, strava_id, start_date, distance, moving_time, average_heartrate, average_watts, sport_type, name, description, hr_zones:raw_data->hrZones')
        .eq('user_id', user.id).order('start_date', { ascending: false }).limit(60),
      supabase.from('goals').select('goal_type, title, target_date').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'user_context').single(),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'goals_overview').single(),
      supabase.from('food_log').select('id, name, calories, protein_g, carb_g, fat_g, meal, source, logged_at').eq('user_id', user.id).gte('logged_at', foodSinceIso).order('logged_at', { ascending: false }),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_history').single(),
      supabase.from('kost_day_status').select('date').eq('user_id', user.id).eq('status', 'complete'),
    ])

    const apiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : process.env.GEMINI_API_KEY!

    if (!profile?.llm_api_key_encrypted) {
      const rate = await checkAndConsumeRateLimit(supabase, user.id)
      if (!rate.allowed) {
        return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 })
      }
    }

    // Same dedup as the dashboard: a real session synced from both Concept2
    // and Garmin counts once, and accidental sub-minute sync fragments don't
    // count at all — otherwise "pass denna vecka/månad" here disagrees with
    // what the dashboard shows for the same period.
    const activities = dedupeForStats(acts ?? [])
    const userBio = (ctxRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''
    const overviewGoal = (overviewRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''
    const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const wellnessStore = wellnessRaw ? (() => { try { return JSON.parse(wellnessRaw) } catch { return null } })() : null
    const wellnessHistory: Array<Record<string, number | string | null>> = wellnessStore?.history ?? []
    const wellness = wellnessHistory[0] ?? null

    const avg7 = (key: string) => {
      const vals = wellnessHistory.slice(0, 7).map(d => d[key]).filter((v): v is number => typeof v === 'number')
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
    }
    const avgSleep7 = avg7('sleepHours')
    const avgSteps7 = avg7('steps')
    const avgHrv7 = avg7('hrv')

    const now = new Date()
    const weekStart = startOfWeek(now)
    // Calendar month, matching the dashboard's "Denna månad" — a trailing
    // 30-day window here previously disagreed with the dashboard whenever a
    // week straddled a month boundary.
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const real = activities.filter(a => a.distance > 1000 && a.moving_time > 180)
    const thisWeek = activities.filter(a => new Date(a.start_date) >= weekStart).length
    const thisMonth = activities.filter(a => new Date(a.start_date) >= monthStart).length
    const totalKm = Math.round(activities.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000)

    const recentStr = activities.slice(0, 15).map(a =>
      `${a.start_date.slice(0, 10)} ${a.sport_type} ${a.distance}m ${Math.floor(a.moving_time / 60)}min${a.average_heartrate ? ` HR${Math.round(a.average_heartrate)}` : ''}`
    ).join('\n')

    const pr30 = real.filter(a => a.moving_time >= 1620 && a.moving_time <= 1980)
    const b30 = pr30.length ? pr30.reduce((b, c) => c.distance > b.distance ? c : b) : null
    const b30SpeedOrPace = b30 ? fmtSpeedOrPace(b30.sport_type, b30.distance, b30.moving_time) : null

    const hasActivities = activities.length > 0
    const hasWellness = wellnessHistory.length > 0
    const stepGoal = profile?.daily_step_goal ?? 10000
    const stepGoalStreak = hasWellness ? currentStepGoalStreak(wellnessHistory as { date: string; steps: number | null }[], stepGoal, now) : 0
    const daysMetGoalLast7 = wellnessHistory.slice(0, 7).filter(d => typeof d.steps === 'number' && (d.steps as number) >= stepGoal).length
    const hasGoals = (goals ?? []).length > 0 || overviewGoal.trim().length > 0

    const yazioHistoryRaw = (yazioHistoryRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const yazioHistory: YazioDay[] = yazioHistoryRaw ? (() => {
      try {
        const parsed = JSON.parse(yazioHistoryRaw)
        return Array.isArray(parsed) ? parsed.map(normalizeYazioDay) : []
      } catch { return [] }
    })() : []
    const trackedMeals = ((profile?.kost_tracked_meals as string[] | null) ?? ['breakfast', 'lunch', 'dinner']).filter((m): m is KostMeal => (KOST_MEALS as string[]).includes(m))
    const dayOverrides = new Set((dayStatusRows ?? []).map(r => r.date as string))

    const nutrition = buildNutritionSummary({
      now,
      todayKey: stockholmDateKey(now),
      yazioHistory,
      manualEntries: (foodLog ?? []) as KostFoodEntry[],
      trackedMeals,
      dayOverrides,
      calorieGoal: profile?.daily_calorie_goal ?? null,
      proteinGoalG: profile?.protein_goal_g ?? null,
      carbGoalG: profile?.carb_goal_g ?? null,
      fatGoalG: profile?.fat_goal_g ?? null,
      deficitEnabled: profile?.deficit_tracking_enabled ?? false,
      deficitBudgetKcal: profile?.deficit_budget_kcal ?? null,
    })

    // Shared data context (short — each agent focuses on what they need)
    const dataBlock = `ATLET: ${profile?.name ?? 'Okänd'}
PASS: ${thisWeek} denna vecka | ${thisMonth} denna månad | ${totalKm} km totalt
${b30 ? `PB 30 min (${b30.sport_type}): ${b30.distance}m${b30SpeedOrPace ? ` (${b30SpeedOrPace.value})` : ''}` : ''}
SÖMN: ${typeof wellness?.sleepHours === 'number' ? wellness.sleepHours.toFixed(1) : 'saknas'}h (7-dagarssnitt: ${avgSleep7 ? avgSleep7.toFixed(1) + 'h' : 'saknas'}) | VILOPULS: ${wellness?.restingHR ?? 'saknas'} bpm | HRV: ${wellness?.hrv ?? 'saknas'} ms (7-dagarssnitt: ${avgHrv7 ? Math.round(avgHrv7) : 'saknas'}) | BODY BATTERY: ${wellness?.bodyBattery ?? 'saknas'}
STEGMÅL: ${stepGoal}/dag | STEG IDAG: ${wellness?.steps ?? 'saknas'} (7-dagarssnitt: ${avgSteps7 ? Math.round(avgSteps7) : 'saknas'}) | DAGAR SENASTE 7 SOM NÅTT MÅLET: ${daysMetGoalLast7}/7 | NUVARANDE STEGMÅLSSTREAK: ${stepGoalStreak} dagar i rad
MÅL: ${(goals ?? []).map(g => g.title).join(' · ') || 'inga aktiva mål'}
${overviewGoal ? `ÖVERGRIPANDE MÅL/FILOSOFI: ${overviewGoal}` : ''}
UTRUSTNING HEMMA: ${profile?.home_equipment?.length ? profile.home_equipment.join(', ') : 'ingen angiven — anta INGEN gymtillgång i styrke-/rörlighetsförslag'}
${profile?.selected_sports?.length ? `AKTIVITETER/SPORTER: ${profile.selected_sports.join(', ')}` : ''}
${userBio ? `BAKGRUND: ${userBio}` : ''}
${hasActivities ? `SENASTE 15 PASS:\n${recentStr}` : 'INGA TRÄNINGSPASS LOGGADE ÄNNU — endast Garmin-hälsodata (sömn/puls/steg) tillgänglig.'}

KOST:
${formatNutritionForPrompt(nutrition)}`

    // One combined question covering all six specialist angles plus the
    // head-coach synthesis — adapted when there's no logged training yet so
    // the team doesn't force a training-frame onto wellness-only data (e.g.
    // a user who's only connected Garmin so far).
    const question = `${dataBlock}

Ge teamets bedömning av datan ovan, ett fält per roll:

data (Dataanalytiker, fokus: helhetsbilden + hur upplägget/målen går): ${hasActivities
      ? 'Identifiera EN tydlig trend eller avvikelse i träningsdatan, med en konkret siffra.'
      : 'Inga träningspass är loggade än, men det finns hälsodata från Garmin. Vad säger sömn-, steg- eller pulstrenden om återhämtningsbasen inför att börja träna strukturerat?'}${
        hasGoals
          ? ' Kommentera dessutom KORT om atleten ser ut att hålla sina mål/sitt upplägg (MÅL/ÖVERGRIPANDE MÅL ovan) utifrån den faktiska träningen.'
          : ' Inga mål är satta — avsluta fältet med en kort, peppande uppmaning att lägga in ett mål under Profil, eftersom det gör resten av teamets råd mycket mer träffsäkra.'
      }

sleep (Sömncoach, fokusera ENBART på sömn): Bedöm sömnkvalitet och -konsistens utifrån SÖMN-raden (dagens värde vs 7-dagarssnitt), och ge ETT konkret råd för bättre sömn eller återhämtning.

steps (Stegcoach, fokusera ENBART på vardagsaktivitet/steg): Kommentera STEGMÅL-raden konkret — t.ex. om stegen legat stabilt över eller under målet en tid (använd DAGAR SENASTE 7 SOM NÅTT MÅLET och STEGMÅLSSTREAK), och ge ETT konkret tips för vardagsaktivitet.

mental (Mentalcoach, fokusera ENBART på det mentala): ${hasActivities
      ? 'Ge ETT konkret mentalt verktyg för nästa vecka, utifrån träningsbeteendet.'
      : 'Inga pass är loggade än. Ge ETT konkret, lågtröskel mentalt verktyg för att komma igång.'}

strength (Styrkecoach för kompletterande träning, KONKRETA övningar): ${hasActivities
      ? 'Namnge 2-3 kompletterande styrkeövningar (med sets/reps) som passar nuvarande träningsbelastning.'
      : 'Inga pass är loggade än. Namnge 2-3 enkla startövningar med sets/reps.'}

mobility (Rörlighets-/stretchcoach, KONKRETA övningar): ${hasActivities
      ? 'Namnge 2-3 rörlighets-/stretchövningar (med hur länge/ofta) för de muskelgrupper träningen belastar mest.'
      : 'Inga pass är loggade än. Namnge 2-3 generella rörlighetsövningar med hur länge/ofta.'}

kostWeek (Kostcoach, fokusera ENBART på DENNA VECKA-raden under KOST — bedöm BARA de dagar som redan hänt, ALDRIG kommande dagar i veckan som "saknad" eller "ofullständig" loggning): ${nutrition.hasData
      ? 'Kommentera hur veckans loggning/kalorier/protein ser ut mot målen SÅ HÄR LÅNGT i veckan, och peka ut EN konkret förbättring för resten av veckan.'
      : 'Ingen kost är loggad än. Ge en kort, peppande uppmaning att börja logga i Kost, och nämn kort varför det gör resten av teamets råd bättre.'}

kostGeneral (Kostcoach, fokusera ENBART på SENASTE 30 DAGARNA/VIKTMÅL/VIKTFÖRÄNDRING-raderna under KOST): ${nutrition.hasData
      ? 'Ge en bredare bild av matvanorna över tid — konsistens, trend, och om Viktmål/vikttrenden (om de finns) stämmer med hur mycket som faktiskt loggas ätits.'
      : 'Ingen kost är loggad än. Håll det till EN kort mening — inget att analysera över tid ännu.'}

summary (Huvudcoach): Läs de sju bedömningarna du själv precis formulerat. Vad är den ENA viktigaste prioriteringen för atleten just nu?`

    const { data, sleep, steps, mental, strength, mobility, kostWeek, kostGeneral, summary } = await askAgentTeam(apiKey, question, profile?.coach_tone)

    const insight = {
      generatedAt: now.toISOString(),
      stats: { sessions: activities.length, thisWeek, thisMonth, totalKm, pr30: b30 ? `${b30.distance}m${b30SpeedOrPace ? ` (${b30SpeedOrPace.value})` : ''}` : null },
      agents: { data, sleep, steps, mental, strength, mobility, kostWeek, kostGeneral, summary },
    }

    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: 'insights',
      messages: [{ role: 'system', content: JSON.stringify(insight) }],
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    return NextResponse.json({ ok: true, insight })
  } catch (err) {
    console.error('Insights error:', err)
    return NextResponse.json({ error: 'Kunde inte generera insikter' }, { status: 500 })
  }
}
