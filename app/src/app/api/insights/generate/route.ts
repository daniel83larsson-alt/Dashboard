import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { startOfWeek } from '@/lib/dates'
import { checkAndConsumeRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { decryptMaybeLegacy } from '@/lib/encrypt'
import { fmtSpeedOrPace } from '@/lib/sport'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

type AgentInsights = { data: string; recovery: string; mental: string; strength: string; mobility: string; summary: string }

// Single call producing all five specialist perspectives + the head coach's
// summary in one structured response, instead of six separate Gemini calls
// (one per specialist + one synthesis) — same shared quota, a sixth of the
// requests, at the cost of each perspective being generated in the same
// pass rather than fully independently.
async function askAgentTeam(apiKey: string, question: string): Promise<AgentInsights> {
  const system = `Du är hela tränarteamet för en uthållighetsidrottare (rodd m.fl.): datadriven analytiker, återhämtnings- och belastningsspecialist, mentalcoach, styrkecoach (kompletterande träning) och rörlighets-/stretchcoach — plus huvudcoach som sammanfattar teamets bedömningar. Svara ENDAST med JSON enligt schema, ett fält per roll. Varje enskilt fält: MAX 2 korta meningar, svenska, konkret, gå direkt på sak, inga bisatser eller utfyllnadsord — utom "summary" som är huvudcoachens syntes i MAX 3 korta meningar (fetstil/punktlistor tillåtet där). Hellre en vass mening än två urvattnade.`

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: question }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        maxOutputTokens: 900,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            data: { type: 'STRING' },
            recovery: { type: 'STRING' },
            mental: { type: 'STRING' },
            strength: { type: 'STRING' },
            mobility: { type: 'STRING' },
            summary: { type: 'STRING' },
          },
          required: ['data', 'recovery', 'mental', 'strength', 'mobility', 'summary'],
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

    const [{ data: profile }, { data: acts }, { data: goals }, { data: ctxRow }, { data: wellnessRow }, { data: overviewRow }] = await Promise.all([
      supabase.from('profiles').select('name, llm_api_key_encrypted, home_equipment, selected_sports').eq('id', user.id).single(),
      supabase.from('activities').select('start_date, distance, moving_time, average_heartrate, average_watts, sport_type')
        .eq('user_id', user.id).order('start_date', { ascending: false }).limit(60),
      supabase.from('goals').select('goal_type, title, target_date').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'user_context').single(),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'goals_overview').single(),
    ])

    const apiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : process.env.GEMINI_API_KEY!

    if (!profile?.llm_api_key_encrypted) {
      const rate = await checkAndConsumeRateLimit(supabase, user.id)
      if (!rate.allowed) {
        return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 })
      }
    }

    const activities = acts ?? []
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

    // Shared data context (short — each agent focuses on what they need)
    const dataBlock = `ATLET: ${profile?.name ?? 'Okänd'}
PASS: ${thisWeek} denna vecka | ${thisMonth} denna månad | ${totalKm} km totalt
${b30 ? `PB 30 min (${b30.sport_type}): ${b30.distance}m${b30SpeedOrPace ? ` (${b30SpeedOrPace.value})` : ''}` : ''}
SÖMN: ${typeof wellness?.sleepHours === 'number' ? wellness.sleepHours.toFixed(1) : 'saknas'}h (7-dagarssnitt: ${avgSleep7 ? avgSleep7.toFixed(1) + 'h' : 'saknas'}) | VILOPULS: ${wellness?.restingHR ?? 'saknas'} bpm
STEG: ${wellness?.steps ?? 'saknas'} (7-dagarssnitt: ${avgSteps7 ? Math.round(avgSteps7) : 'saknas'}) | HRV: ${wellness?.hrv ?? 'saknas'} ms (7-dagarssnitt: ${avgHrv7 ? Math.round(avgHrv7) : 'saknas'}) | BODY BATTERY: ${wellness?.bodyBattery ?? 'saknas'}
MÅL: ${(goals ?? []).map(g => g.title).join(' · ') || 'inga aktiva mål'}
${overviewGoal ? `ÖVERGRIPANDE MÅL/FILOSOFI: ${overviewGoal}` : ''}
UTRUSTNING HEMMA: ${profile?.home_equipment?.length ? profile.home_equipment.join(', ') : 'ingen angiven — anta INGEN gymtillgång i styrke-/rörlighetsförslag'}
${profile?.selected_sports?.length ? `AKTIVITETER/SPORTER: ${profile.selected_sports.join(', ')}` : ''}
${userBio ? `BAKGRUND: ${userBio}` : ''}
${hasActivities ? `SENASTE 15 PASS:\n${recentStr}` : 'INGA TRÄNINGSPASS LOGGADE ÄNNU — endast Garmin-hälsodata (sömn/puls/steg) tillgänglig.'}`

    // One combined question covering all five specialist angles plus the
    // head-coach synthesis — adapted when there's no logged training yet so
    // the team doesn't force a training-frame onto wellness-only data (e.g.
    // a user who's only connected Garmin so far).
    const question = `${dataBlock}

Ge teamets bedömning av datan ovan, ett fält per roll:

data (Dataanalytiker): ${hasActivities
      ? 'Identifiera EN tydlig trend eller avvikelse i träningsdatan, med en konkret siffra.'
      : 'Inga träningspass är loggade än, men det finns hälsodata från Garmin. Vad säger sömn-, steg- eller pulstrenden om återhämtningsbasen inför att börja träna strukturerat?'}

recovery (Återhämtningsspecialist, fokusera ENBART på återhämtning): ${hasActivities
      ? 'Bedöm återhämtningsstatus utifrån vilopuls och sömn, och ge ETT konkret råd.'
      : 'Bedöm återhämtningsbasen utifrån sömn, vilopuls och HRV (inga träningspass loggade än), och ge ETT konkret råd.'}

mental (Mentalcoach, fokusera ENBART på det mentala): ${hasActivities
      ? 'Ge ETT konkret mentalt verktyg för nästa vecka, utifrån träningsbeteendet.'
      : 'Inga pass är loggade än. Ge ETT konkret, lågtröskel mentalt verktyg för att komma igång.'}

strength (Styrkecoach för kompletterande träning, KONKRETA övningar): ${hasActivities
      ? 'Namnge 2-3 kompletterande styrkeövningar (med sets/reps) som passar nuvarande träningsbelastning.'
      : 'Inga pass är loggade än. Namnge 2-3 enkla startövningar med sets/reps.'}

mobility (Rörlighets-/stretchcoach, KONKRETA övningar): ${hasActivities
      ? 'Namnge 2-3 rörlighets-/stretchövningar (med hur länge/ofta) för de muskelgrupper träningen belastar mest.'
      : 'Inga pass är loggade än. Namnge 2-3 generella rörlighetsövningar med hur länge/ofta.'}

summary (Huvudcoach): Läs de fem bedömningarna du själv precis formulerat. Vad är den ENA viktigaste prioriteringen för atleten just nu?`

    const { data, recovery, mental, strength, mobility, summary } = await askAgentTeam(apiKey, question)

    const insight = {
      generatedAt: now.toISOString(),
      stats: { sessions: activities.length, thisWeek, thisMonth, totalKm, pr30: b30 ? `${b30.distance}m${b30SpeedOrPace ? ` (${b30SpeedOrPace.value})` : ''}` : null },
      agents: { data, recovery, mental, strength, mobility, summary },
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
