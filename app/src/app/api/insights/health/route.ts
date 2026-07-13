import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { checkAndConsumeRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { decryptMaybeLegacy } from '@/lib/encrypt'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

type HealthInsight = { recovery: string; mental: string }

// Separate from /api/insights/generate on purpose: this one only ever looks
// at wellness data (sleep/HR/HRV/steps/Body Battery) for the Hälsa page,
// while the Insikter page's team analysis covers the full training picture.
// Two short fields instead of six — kept intentionally brief.
async function askHealthTeam(apiKey: string, question: string): Promise<HealthInsight> {
  const system = 'Du är återhämtnings- och mentalcoach för en uthållighetsidrottare. Svara ENDAST med JSON enligt schema. Fokusera BARA på hälsodata (sömn, vilopuls, HRV, steg, Body Battery) — inte träningspass eller personbästa. Varje fält: 2-3 meningar, svenska, konkret.'

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: question }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        maxOutputTokens: 500,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            recovery: { type: 'STRING' },
            mental: { type: 'STRING' },
          },
          required: ['recovery', 'mental'],
        },
      },
    }),
  })
  const d = await res.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text
  if (!res.ok || !text) {
    throw new Error(`Gemini call failed: ${d.error?.message ?? res.status}`)
  }
  return JSON.parse(text) as HealthInsight
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })
    logApiCall(supabase, user.id, 'insights_health')

    const [{ data: profile }, { data: wellnessRow }] = await Promise.all([
      supabase.from('profiles').select('llm_api_key_encrypted').eq('id', user.id).single(),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    ])

    const apiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : process.env.GEMINI_API_KEY!

    if (!profile?.llm_api_key_encrypted) {
      const rate = await checkAndConsumeRateLimit(supabase, user.id)
      if (!rate.allowed) {
        return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 })
      }
    }

    const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const wellnessStore = wellnessRaw ? (() => { try { return JSON.parse(wellnessRaw) } catch { return null } })() : null
    const history: Array<Record<string, number | string | null>> = wellnessStore?.history ?? []

    if (history.length === 0) {
      return NextResponse.json({ error: 'Ingen hälsodata att analysera än' }, { status: 400 })
    }

    const avg = (key: string, n = 7) => {
      const vals = history.slice(0, n).map(d => d[key]).filter((v): v is number => typeof v === 'number')
      return vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : null
    }

    const latest = history[0]
    const question = `SENASTE DAG: vilopuls ${latest.restingHR ?? 'saknas'} bpm, sömn ${typeof latest.sleepHours === 'number' ? latest.sleepHours.toFixed(1) + 'h' : 'saknas'}, HRV ${latest.hrv ?? 'saknas'} ms, steg ${latest.steps ?? 'saknas'}, Body Battery ${latest.bodyBattery ?? 'saknas'}
7-DAGARSSNITT: vilopuls ${avg('restingHR') ?? 'saknas'} bpm, sömn ${avg('sleepHours') ?? 'saknas'}h, HRV ${avg('hrv') ?? 'saknas'} ms, steg ${avg('steps') ?? 'saknas'}

recovery: bedöm återhämtningsstatus utifrån vilopuls/sömn/HRV — trend, obalans eller allt ser bra ut?
mental: vad säger dagsformen (sömn/Body Battery) om läge för fokus och motivation just nu — ge ett kort konkret tips.`

    const insight = await askHealthTeam(apiKey, question)
    const result = { generatedAt: new Date().toISOString(), ...insight }

    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: 'health_insights',
      messages: [{ role: 'system', content: JSON.stringify(result) }],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    return NextResponse.json({ ok: true, insight: result })
  } catch (err) {
    console.error('Health insights error:', err)
    return NextResponse.json({ error: 'Kunde inte generera hälsoinsikter' }, { status: 500 })
  }
}
