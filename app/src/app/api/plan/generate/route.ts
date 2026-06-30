import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function fmtPace(seconds: number, meters: number) {
  if (!meters) return '--'
  const p = (seconds / meters) * 500
  return `${Math.floor(p / 60)}:${Math.round(p % 60).toString().padStart(2, '0')}`
}

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

    const [{ data: activities }, { data: goals }, { data: profile }] = await Promise.all([
      supabase.from('activities').select('*').eq('user_id', user.id).order('start_date', { ascending: false }).limit(30),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('profiles').select('name, llm_api_key_encrypted').eq('id', user.id).single(),
    ])

    const acts = activities ?? []
    const real = acts.filter(a => (a.distance ?? 0) >= 1000 && (a.moving_time ?? 0) >= 180)

    // Compute PR summary for context
    const pr30 = real.filter(a => a.moving_time >= 1620 && a.moving_time <= 1980)
    const best30 = pr30.length ? pr30.reduce((b, a) => (a.distance > b.distance ? a : b)) : null

    // Week frequency
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)
    const recentWeek = acts.filter(a => new Date(a.start_date) >= weekAgo)
    const recentMonth = acts.filter(a => new Date(a.start_date) >= monthAgo)

    const contextBlock = `
TRÄNINGSDATA (senaste 30 pass):
${real.slice(0, 20).map(a =>
  `${a.start_date.slice(0, 10)}  ${a.distance}m  ${fmtDur(a.moving_time)}  ${fmtPace(a.moving_time, a.distance)}/500m${a.average_heartrate ? `  HR:${Math.round(a.average_heartrate)}` : ''}`
).join('\n')}

SAMMANFATTNING:
- Totalt antal pass: ${acts.length}
- Senaste veckan: ${recentWeek.length} pass
- Senaste månaden: ${recentMonth.length} pass
- Bäst 30-min: ${best30 ? `${best30.distance}m (${fmtPace(best30.moving_time, best30.distance)}/500m)` : 'okänt'}

MÅL:
${goals?.length ? goals.map(g => `- ${g.title} (${g.goal_type})${g.target_date ? ` — måldatum: ${g.target_date}` : ' — inget måldatum'}`).join('\n') : '- Inga specificerade mål'}
`

    const hasTargetedGoal = (goals ?? []).some(g => g.target_date)

    const prompt = `Du är en erfaren roddcoach. Bestäm vilken typ av upplägg som passar bäst utifrån målen nedan:

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

    const geminiKey = profile?.llm_api_key_encrypted ?? process.env.GEMINI_API_KEY!
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
