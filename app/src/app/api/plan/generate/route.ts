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
${goals?.length ? goals.map(g => `- ${g.title} (${g.goal_type})`).join('\n') : '- Inga specificerade mål'}
`

    const prompt = `Du är en erfaren roddcoach. Skapa ett konkret träningsupplägg för de kommande 4 veckorna baserat på användarens träningshistorik.

${contextBlock}

Ge ett strukturerat upplägg med:
1. En kort analys av nuläget (2-3 meningar)
2. Vecka-för-vecka plan med specifika pass (typ av pass, distans/tid, intensitet)
3. Fokusområden för perioden

Var konkret: ange faktiska tider och distanser. Anpassa till deras nuvarande nivå.
Svara på svenska. Håll det kortfattat men informativt (max 400 ord).`

    const geminiKey = profile?.llm_api_key_encrypted ?? process.env.GEMINI_API_KEY!
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )
    const geminiData = await res.json()
    const plan = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!plan) {
      return NextResponse.json({ error: 'Kunde inte generera plan' }, { status: 500 })
    }

    // Store plan in coach_sessions with special id 'weekly_plan'
    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: 'weekly_plan',
      messages: [{ role: 'assistant', content: plan }],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    return NextResponse.json({ plan })
  } catch (err) {
    console.error('Plan generate error:', err)
    return NextResponse.json({ error: 'Generering misslyckades' }, { status: 500 })
  }
}
