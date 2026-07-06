import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { startOfWeek } from '@/lib/dates'
import { checkAndConsumeRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { decryptMaybeLegacy } from '@/lib/encrypt'
import { fmtSpeedOrPace, sportLabel, fmtMinSec } from '@/lib/sport'

function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    logApiCall(supabase, user.id, 'plan_generate')

    const [{ data: activities }, { data: goals }, { data: profile }, { data: overviewRow }] = await Promise.all([
      supabase.from('activities').select('*').eq('user_id', user.id).order('start_date', { ascending: false }).limit(30),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('profiles').select('name, llm_api_key_encrypted, home_equipment, selected_sports').eq('id', user.id).single(),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'goals_overview').single(),
    ])

    const overviewGoal = (overviewRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''

    if (!profile?.llm_api_key_encrypted) {
      const rate = await checkAndConsumeRateLimit(supabase, user.id)
      if (!rate.allowed) {
        return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 })
      }
    }

    const acts = activities ?? []
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

MÅL:
${goals?.length ? goals.map(g => `- ${g.title} (${g.goal_type})${g.target_date ? ` — måldatum: ${g.target_date}` : ' — inget måldatum'}`).join('\n') : '- Inga specificerade mål'}
${overviewGoal ? `\nÖVERGRIPANDE MÅL/FILOSOFI: ${overviewGoal}` : ''}

UTRUSTNING HEMMA: ${profile?.home_equipment?.length ? profile.home_equipment.join(', ') : 'ingen angiven — anta INGEN gymtillgång, lägg bara in pass som går att göra med kroppsvikt eller det atleten faktiskt loggar pass med'}
${profile?.selected_sports?.length ? `AKTIVITETER/SPORTER ATLETEN UTÖVAR: ${profile.selected_sports.join(', ')}` : ''}
`

    const hasTargetedGoal = (goals ?? []).some(g => g.target_date)

    const prompt = `Du är ett erfaret tränarteam inom uthållighetsidrott (rodd, cykling, löpning m.fl.). Utgå från vilken/vilka sporter atleten faktiskt loggar pass inom (se träningsdatan nedan) — anta inte att det är rodd om det inte stämmer. Bestäm vilken typ av upplägg som passar bäst utifrån målen nedan:

- Om det finns ett mål med specifikt datum: bygg planen som steg mot det målet (ramad som "vecka-för-vecka mot målet").
- Om det INTE finns något datumsatt mål: ramma planen som "kör det här upplägget i 2-3 veckor, vi justerar sedan efter varje kommande pass" — alltså adaptiv, inte ett fast långtidsschema.

${contextBlock}

Svara ENDAST med JSON i detta exakta format (inga kommentarer, ingen extra text):
{
  "planType": "mot_mal" eller "adaptiv",
  "philosophy": "2-3 meningar som förklarar upplägget och varför, anpassat efter vilken typ du valde",
  "focusAreas": ["fokusområde 1", "fokusområde 2", "fokusområde 3"],
  "sessions": [
    { "day": "Måndag", "type": "Vila" eller "Lugn distans" eller "Intervaller" etc, "description": "konkret beskrivning med tid/distans/intensitet" }
  ]
}

"sessions" ska täcka de kommande 7 dagarna (alla 7 dagar, inklusive vilodagar). Var konkret med faktiska tider och distanser anpassat till atletens nuvarande nivå. Svara på svenska.`

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
                planType: { type: 'STRING', enum: ['mot_mal', 'adaptiv'] },
                philosophy: { type: 'STRING' },
                focusAreas: { type: 'ARRAY', items: { type: 'STRING' } },
                sessions: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      day: { type: 'STRING' },
                      type: { type: 'STRING' },
                      description: { type: 'STRING' },
                    },
                    required: ['day', 'type', 'description'],
                  },
                },
              },
              required: ['planType', 'philosophy', 'focusAreas', 'sessions'],
            },
          },
        }),
      }
    )
    const geminiData = await res.json()
    const rawPlan = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    let plan
    try {
      plan = JSON.parse(rawPlan)
    } catch {
      plan = null
    }

    if (!plan) {
      return NextResponse.json({ error: 'Kunde inte generera plan' }, { status: 500 })
    }

    const planWithMeta = { ...plan, generatedAt: new Date().toISOString(), hasTargetedGoal }

    // Store plan in coach_sessions with special id 'weekly_plan'
    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: 'weekly_plan',
      messages: [{ role: 'assistant', content: JSON.stringify(planWithMeta) }],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    return NextResponse.json({ plan: planWithMeta })
  } catch (err) {
    console.error('Plan generate error:', err)
    return NextResponse.json({ error: 'Generering misslyckades' }, { status: 500 })
  }
}
