import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

async function askAgent(apiKey: string, system: string, question: string): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: question }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  const d = await res.json()
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [{ data: profile }, { data: acts }, { data: goals }, { data: ctxRow }, { data: wellnessRow }] = await Promise.all([
      supabase.from('profiles').select('name, llm_api_key_encrypted').eq('id', user.id).single(),
      supabase.from('activities').select('start_date, distance, moving_time, average_heartrate, average_watts, sport_type')
        .eq('user_id', user.id).order('start_date', { ascending: false }).limit(60),
      supabase.from('goals').select('goal_type, title, target_date').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'user_context').single(),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    ])

    const apiKey = profile?.llm_api_key_encrypted ?? process.env.GEMINI_API_KEY!
    const activities = acts ?? []
    const userBio = (ctxRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''
    const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const wellness = wellnessRaw ? (() => { try { return JSON.parse(wellnessRaw) } catch { return null } })() : null

    const now = new Date()
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
    const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30)

    function fmtPace(s: number, m: number) {
      if (!m || !s) return '--'
      const p = (s / m) * 500
      return `${Math.floor(p / 60)}:${Math.round(p % 60).toString().padStart(2, '0')}`
    }

    const real = activities.filter(a => a.distance > 1000 && a.moving_time > 180)
    const thisWeek = activities.filter(a => new Date(a.start_date) >= weekAgo).length
    const thisMonth = activities.filter(a => new Date(a.start_date) >= monthAgo).length
    const totalKm = Math.round(activities.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000)

    const recentStr = activities.slice(0, 15).map(a =>
      `${a.start_date.slice(0, 10)} ${a.sport_type} ${a.distance}m ${Math.floor(a.moving_time / 60)}min${a.average_heartrate ? ` HR${Math.round(a.average_heartrate)}` : ''}`
    ).join('\n')

    const dataBlock = `ANVÄNDARE: ${profile?.name ?? 'Okänd'}
PASS: ${activities.length} tot | ${thisWeek}/v | ${thisMonth}/mån | ${totalKm} km all time
SÖMN: ${wellness?.sleepHours?.toFixed(1) ?? 'okänd'}h | VILOPULS: ${wellness?.restingHR ?? 'okänd'} bpm
MÅL: ${(goals ?? []).map(g => g.title).join(' · ') || 'inga'}
${userBio ? `KONTEXT: ${userBio}` : ''}
SENASTE PASS:
${recentStr}`

    const question = `Analysera träningsdata nedan. Ge din specifika bedömning på 3-5 meningar. Var direkt, konkret och personlig. Referera till faktisk data.\n\n${dataBlock}`

    // Run all agents in parallel
    const [coach, data, recovery, mental, strength] = await Promise.all([
      askAgent(apiKey, 'Du är en erfaren roddcoach. Fokus: teknik, progression, passupplägg. Svara på svenska, 3-5 meningar.', question),
      askAgent(apiKey, 'Du är dataanalytiker för träning. Fokus: trender, mönster, procentuella förändringar. Svara på svenska, 3-5 meningar.', question),
      askAgent(apiKey, 'Du är återhämtningsspecialist. Fokus: belastningsbalans, vilopuls, sömn, risk för överträning. Svara på svenska, 3-5 meningar.', question),
      askAgent(apiKey, 'Du är mentalcoach för idrottare. Fokus: mindset, motivation, mental styrka, mental uthållighet. Svara på svenska, 3-5 meningar.', question),
      askAgent(apiKey, 'Du är styrkecoach med specialisering på kompletterande träning för uthållighetsidrottare. Fokus: kompletteringsträning, core, styrkeövningar. Svara på svenska, 3-5 meningar.', question),
    ])

    // Find best 30-min session for pace context
    const pr30 = real.filter(a => a.moving_time >= 1620 && a.moving_time <= 1980)
    const b30 = pr30.length ? pr30.reduce((b, c) => c.distance > b.distance ? c : b) : null

    const insight = {
      generatedAt: now.toISOString(),
      stats: { sessions: activities.length, thisWeek, thisMonth, totalKm, pr30: b30 ? `${b30.distance}m (${fmtPace(b30.moving_time, b30.distance)}/500m)` : null },
      agents: { coach, data, recovery, mental, strength },
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
