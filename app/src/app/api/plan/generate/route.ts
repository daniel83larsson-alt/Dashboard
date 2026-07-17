import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { startOfWeek } from '@/lib/dates'
import { checkAndConsumeRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { decryptMaybeLegacy } from '@/lib/encrypt'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import { fmtSpeedOrPace, sportLabel, fmtMinSec, SPORT_LABELS } from '@/lib/sport'
import { dedupeForStats } from '@/lib/duplicates'

function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

// Ordered Mon→Sun so the AI's per-day output maps to a real date by
// position, not by parsing its Swedish weekday label (locale-fragile).
const WEEKDAY_LABELS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag']

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })
    logApiCall(supabase, user.id, 'plan_generate')

    const [{ data: activities }, { data: goals }, { data: profile }, { data: overviewRow }] = await Promise.all([
      supabase.from('activities').select('*').eq('user_id', user.id).order('start_date', { ascending: false }).limit(30),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('profiles').select('name, llm_api_key_encrypted, home_equipment, selected_sports').eq('id', user.id).single(),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'goals_overview').single(),
    ])

    // Weekly planning requires an approved goal — a coach-proposed goal sits
    // as status='proposed' until Daniel/the athlete approves it in the UI,
    // so this filter (status='active' above) already excludes it. No
    // goal-less "just give me something to do" plan in v1, per the product
    // decision: the coach sets an overarching goal, it gets approved, THEN
    // weeks get planned under it.
    if (!goals?.length) {
      return NextResponse.json({ error: 'no_active_goal', message: 'Inget godkänt mål ännu — sätt ett mål med coachen först, så kan veckan planeras.' }, { status: 409 })
    }

    // Nearest target_date wins (most time-pressured goal shapes the week);
    // falls back to the first active goal if none have a date.
    const targetGoal = [...goals].sort((a, b) => {
      if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date)
      if (a.target_date) return -1
      if (b.target_date) return 1
      return 0
    })[0]

    const overviewGoal = (overviewRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''

    if (!profile?.llm_api_key_encrypted) {
      const rate = await checkAndConsumeRateLimit(supabase, user.id)
      if (!rate.allowed) {
        return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 })
      }
    }

    // Same dedup as the dashboard/Insikter: a real session synced from both
    // Concept2 and Garmin counts once, and sub-minute sync fragments don't
    // count at all.
    const acts = dedupeForStats(activities ?? [])
    const real = acts.filter(a => (a.distance ?? 0) >= 1000 && (a.moving_time ?? 0) >= 180)

    // Rowing-only PR — mixing in another sport's best 30-min effort here
    // would misrepresent it with rowing's /500m pace math.
    const rowingReal = real.filter(a => a.sport_type === 'Rowing')
    const pr30 = rowingReal.filter(a => a.moving_time >= 1620 && a.moving_time <= 1980)
    const best30 = pr30.length ? pr30.reduce((b, a) => (a.distance > b.distance ? a : b)) : null

    // Week frequency
    const weekStart = startOfWeek(new Date())
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)
    const recentWeek = acts.filter(a => new Date(a.start_date) >= weekStart)
    const recentMonth = acts.filter(a => new Date(a.start_date) >= monthAgo)

    const sportVocab = Object.keys(SPORT_LABELS).join(', ')

    const contextBlock = `
TRÄNINGSDATA (senaste 30 pass, alla sporter):
${real.slice(0, 20).map(a => {
  const speedOrPace = fmtSpeedOrPace(a.sport_type, a.distance, a.moving_time)
  return `${a.start_date.slice(0, 10)}  ${sportLabel(a.sport_type)}  ${a.distance}m  ${fmtDur(a.moving_time)}${speedOrPace ? `  ${speedOrPace.value}` : ''}${a.average_heartrate ? `  HR:${Math.round(a.average_heartrate)}` : ''}`
}).join('\n')}

SAMMANFATTNING:
- Totalt antal pass: ${acts.length}
- Senaste veckan: ${recentWeek.length} pass
- Senaste månaden: ${recentMonth.length} pass
- Bäst 30-min rodd: ${best30 ? `${best30.distance}m (${fmtMinSec((best30.moving_time / best30.distance) * 500)}/500m)` : 'okänt (eller ingen rodd loggad)'}

STÅENDE MÅL (godkänt av atleten, styr den här veckan):
- ${targetGoal.title} (${targetGoal.goal_type})${targetGoal.target_date ? ` — måldatum: ${targetGoal.target_date}` : ' — inget måldatum'}${targetGoal.description ? `\n  ${targetGoal.description}` : ''}
${goals.length > 1 ? `\nÖVRIGA AKTIVA MÅL:\n${goals.filter(g => g.id !== targetGoal.id).map(g => `- ${g.title} (${g.goal_type})`).join('\n')}` : ''}
${overviewGoal ? `\nÖVERGRIPANDE FILOSOFI: ${overviewGoal}` : ''}

UTRUSTNING HEMMA: ${profile?.home_equipment?.length ? profile.home_equipment.join(', ') : 'ingen angiven — anta INGEN gymtillgång, lägg bara in pass som går att göra med kroppsvikt eller det atleten faktiskt loggar pass med'}
${profile?.selected_sports?.length ? `AKTIVITETER/SPORTER ATLETEN UTÖVAR: ${profile.selected_sports.join(', ')}` : ''}
`

    const planType = targetGoal.target_date ? 'mot_mal' : 'adaptiv'

    const prompt = `Du är ett erfaret tränarteam inom uthållighetsidrott (rodd, cykling, löpning m.fl.). Utgå från vilken/vilka sporter atleten faktiskt loggar pass inom (se träningsdatan nedan) — anta inte att det är rodd om det inte stämmer. Planera DEN HÄR VECKAN (7 dagar, måndag till söndag) utifrån det stående målet nedan:

${planType === 'mot_mal'
  ? '- Målet har ett specifikt datum: bygg veckan som ett konkret steg mot det målet.'
  : '- Målet har inget specifikt datum: ramma veckan som "kör det här upplägget, vi justerar nästa vecka utifrån hur det gick" — adaptivt, inte ett fast långtidsschema.'}

${contextBlock}

Svara ENDAST med JSON i detta exakta format (inga kommentarer, ingen extra text):
{
  "philosophy": "2-3 meningar som förklarar den här veckans upplägg och varför",
  "focusAreas": ["fokusområde 1", "fokusområde 2", "fokusområde 3"],
  "sessions": [
    { "day": "Måndag", "isRest": false, "sportType": "Rowing" eller null om vilodag/ospecifikt, "title": "Lugn distans" eller "Intervaller" etc, "description": "konkret beskrivning med tid/distans/intensitet" }
  ]
}

"sessions" ska innehålla EXAKT 7 poster i ordningen ${WEEKDAY_LABELS.join(', ')} (inklusive vilodagar, isRest:true för dem). "sportType" måste vara ett av: ${sportVocab} — eller null för vilodagar/pass som inte tydligt tillhör en specifik sport. Var konkret med faktiska tider och distanser anpassat till atletens nuvarande nivå. Svara på svenska.`

    const geminiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : process.env.GEMINI_API_KEY!
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1536,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                philosophy: { type: 'STRING' },
                focusAreas: { type: 'ARRAY', items: { type: 'STRING' } },
                sessions: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      day: { type: 'STRING' },
                      isRest: { type: 'BOOLEAN' },
                      sportType: { type: 'STRING', nullable: true },
                      title: { type: 'STRING' },
                      description: { type: 'STRING' },
                    },
                    required: ['day', 'isRest', 'title', 'description'],
                  },
                },
              },
              required: ['philosophy', 'focusAreas', 'sessions'],
            },
          },
        }),
      }
    )
    const geminiData = await res.json()
    const rawPlan = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    let plan: { philosophy: string; focusAreas: string[]; sessions: Array<{ day: string; isRest: boolean; sportType?: string | null; title: string; description: string }> } | null = null
    try {
      plan = JSON.parse(rawPlan)
    } catch {
      plan = null
    }

    if (!plan || !Array.isArray(plan.sessions) || plan.sessions.length !== 7) {
      return NextResponse.json({ error: 'Kunde inte generera plan' }, { status: 500 })
    }

    // Upsert this week's plan row (regenerating overwrites the SAME week —
    // past weeks are never touched, which is what makes the adherence trend
    // possible later).
    const { data: planRow, error: planError } = await supabase
      .from('training_plans')
      .upsert({
        user_id: user.id,
        week_start: weekStart.toISOString().slice(0, 10),
        plan_type: planType,
        philosophy: plan.philosophy,
        focus_areas: plan.focusAreas ?? [],
        goal_id: targetGoal.id,
        status: 'active',
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,week_start' })
      .select('id, week_start')
      .single()

    if (planError || !planRow) {
      console.error('Plan upsert error:', planError)
      return NextResponse.json({ error: 'Kunde inte spara plan' }, { status: 500 })
    }

    // Replace this week's sessions wholesale — simplest correct behavior for
    // a regenerate, and matches the "new plan once a week" cadence (no
    // partial merge logic needed for mid-week edits, which the product
    // decision explicitly ruled out for v1).
    await supabase.from('plan_sessions').delete().eq('plan_id', planRow.id)

    const sessionRows = plan.sessions.map((s, i) => {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i)
      return {
        plan_id: planRow.id,
        user_id: user.id,
        planned_date: date.toISOString().slice(0, 10),
        is_rest: !!s.isRest,
        sport_type: s.isRest ? null : (s.sportType ?? null),
        title: s.title,
        description: s.description,
        status: 'planned' as const,
      }
    })

    const { data: insertedSessions, error: sessionsError } = await supabase
      .from('plan_sessions')
      .insert(sessionRows)
      .select('*')

    if (sessionsError) {
      console.error('Plan sessions insert error:', sessionsError)
      return NextResponse.json({ error: 'Kunde inte spara passen' }, { status: 500 })
    }

    return NextResponse.json({
      plan: {
        id: planRow.id,
        weekStart: planRow.week_start,
        planType,
        philosophy: plan.philosophy,
        focusAreas: plan.focusAreas ?? [],
        sessions: insertedSessions,
      },
    })
  } catch (err) {
    console.error('Plan generate error:', err)
    return NextResponse.json({ error: 'Generering misslyckades' }, { status: 500 })
  }
}
