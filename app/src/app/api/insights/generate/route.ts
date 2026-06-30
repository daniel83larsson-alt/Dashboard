import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

async function askAgent(apiKey: string, system: string, question: string, maxTokens = 350): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: question }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
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

    const pr30 = real.filter(a => a.moving_time >= 1620 && a.moving_time <= 1980)
    const b30 = pr30.length ? pr30.reduce((b, c) => c.distance > b.distance ? c : b) : null

    // Shared data context (short — each agent focuses on what they need)
    const dataBlock = `ATLET: ${profile?.name ?? 'Okänd'}
PASS: ${thisWeek} denna vecka | ${thisMonth} denna månad | ${totalKm} km totalt
${b30 ? `PB 30 min: ${b30.distance}m (${fmtPace(b30.moving_time, b30.distance)}/500m)` : ''}
SÖMN: ${wellness?.sleepHours?.toFixed(1) ?? 'saknas'}h | VILOPULS: ${wellness?.restingHR ?? 'saknas'} bpm
MÅL: ${(goals ?? []).map(g => g.title).join(' · ') || 'inga aktiva mål'}
${userBio ? `BAKGRUND: ${userBio}` : ''}
SENASTE 15 PASS:
${recentStr}`

    // Each specialist gets a unique, focused question
    const [data, recovery, mental, strength, mobility] = await Promise.all([
      askAgent(
        apiKey,
        'Du är datadriven träningsanalytiker. Svara på svenska, 3-5 meningar. Gå direkt på mönster — hoppa över sammanfattning av grundstatistik.',
        `Identifiera 2-3 konkreta trender eller avvikelser i träningsdata nedan. Vad säger pulsdata, distans eller tidsfördelning om utvecklingen? Lyft specifika siffror.\n\n${dataBlock}`
      ),
      askAgent(
        apiKey,
        'Du är återhämtnings- och belastningsspecialist. Svara på svenska, 3-5 meningar. Fokusera ENBART på återhämtning, inte på träningsupplägg.',
        `Bedöm belastningsbalansen och återhämtningsstatus. Finns tecken på underrecovery eller överträning? Vad indikerar vilopuls och sömn? Ge ett konkret råd.\n\n${dataBlock}`
      ),
      askAgent(
        apiKey,
        'Du är mentalcoach för idrottare. Svara på svenska, 3-5 meningar. Fokusera ENBART på det mentala — inte på fysisk träning.',
        `Vad avslöjar träningsbeteendet om mentalt tillstånd, motivation och konsekvens? Ge ett konkret mentalt verktyg eller tankesätt att använda nästa vecka.\n\n${dataBlock}`
      ),
      askAgent(
        apiKey,
        'Du är styrkecoach specialiserad på kompletterande träning för roddare. Svara på svenska, 3-5 meningar. Föreslå KONKRETA övningar — inte generella råd.',
        `Föreslå ett kompletterande styrkepass som passar atletens nuvarande träningsbelastning. Namnge 3-4 övningar med sets och reps.\n\n${dataBlock}`
      ),
      askAgent(
        apiKey,
        'Du är rörlighets- och stretchcoach specialiserad på roddare och uthållighetsidrottare. Svara på svenska, 3-5 meningar. Föreslå KONKRETA stretch-/mobilityövningar kopplade till vilka muskelgrupper som belastas av sporten i datan — inte generella råd.',
        `Baserat på vilken typ av träning atleten kör (se sporttyp och volym i datan), vilka muskelgrupper/leder riskerar att bli stela eller obalanserade? Föreslå 3-4 konkreta stretch-/rörlighetsövningar med namn och hur länge/ofta de bör göras.\n\n${dataBlock}`
      ),
    ])

    // Head coach synthesizes all specialist input
    const summaryContext = `${dataBlock}

SPECIALISTERNAS BEDÖMNINGAR:
📊 Dataanalytiker: ${data}
💤 Återhämtning: ${recovery}
🧠 Mental: ${mental}
💪 Styrka: ${strength}
🤸 Rörlighet: ${mobility}`

    const summary = await askAgent(
      apiKey,
      'Du är huvudcoach och ordförande för detta tränarteam. Svara på svenska. Skriv en syntes i 4-6 meningar. Du får använda fetstil och punktlistor för tydlighet.',
      `Läs specialisternas bedömningar och sammanfatta det viktigaste för atleten. Vad är det enda viktigaste fokusområdet just nu? Ge 2-3 konkreta prioriteringar för de kommande 2 veckorna.\n\n${summaryContext}`,
      500
    )

    const insight = {
      generatedAt: now.toISOString(),
      stats: { sessions: activities.length, thisWeek, thisMonth, totalKm, pr30: b30 ? `${b30.distance}m (${fmtPace(b30.moving_time, b30.distance)}/500m)` : null },
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
