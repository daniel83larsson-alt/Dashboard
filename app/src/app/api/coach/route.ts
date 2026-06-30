import { NextRequest, NextResponse } from 'next/server'
import { COACHES, getCoachById, CoachId, UserContext } from '@/lib/agents/coaches'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type Message = { role: string; content: string }

async function callGemini(apiKey: string, systemPrompt: string, history: Message[], message: string): Promise<string> {
  const contents = [
    ...history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ]
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  )
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callAnthropic(apiKey: string, systemPrompt: string, history: Message[], message: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { coachId, message, sport } = await request.json()
    const coach = getCoachById(coachId as CoachId)
    if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, llm_api_key_encrypted, llm_provider')
      .eq('id', user.id)
      .single()

    const { data: recentActivities } = await supabase
      .from('activities')
      .select('start_date, distance, moving_time, average_heartrate, max_heartrate, average_watts')
      .eq('user_id', user.id)
      .eq('sport_type', sport)
      .order('start_date', { ascending: false })
      .limit(10)

    const { data: goals } = await supabase
      .from('goals')
      .select('goal_type, title, target_date')
      .eq('user_id', user.id)
      .eq('status', 'active')

    const { data: sessionData } = await supabase
      .from('coach_sessions')
      .select('messages')
      .eq('user_id', user.id)
      .eq('coach_id', coachId)
      .single()

    const userContext: UserContext = {
      sport,
      name: profile?.name ?? 'Användaren',
      recentActivities: (recentActivities ?? []).map(a => ({
        date: a.start_date,
        distance: a.distance,
        duration: a.moving_time,
        avgHR: a.average_heartrate ?? undefined,
        maxHR: a.max_heartrate ?? undefined,
        avgWatts: a.average_watts ?? undefined,
      })),
      goals: (goals ?? []).map(g => ({
        type: g.goal_type,
        title: g.title,
        targetDate: g.target_date ?? undefined,
      })),
    }

    const history = (sessionData?.messages ?? []) as Message[]
    const systemPrompt = coach.systemPrompt(sport, userContext)
    const userApiKey = profile?.llm_api_key_encrypted
    const userProvider = profile?.llm_provider

    let reply: string
    if (userApiKey && userProvider === 'anthropic') {
      reply = await callAnthropic(userApiKey, systemPrompt, history, message)
    } else {
      reply = await callGemini(userApiKey ?? process.env.GEMINI_API_KEY!, systemPrompt, history, message)
    }

    const updatedMessages = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: reply },
    ]

    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: coachId,
      messages: updatedMessages,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('Coach API error:', err)
    return NextResponse.json({ error: 'Coach unavailable' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json(
    COACHES.map(c => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      role: c.role,
      hasVeto: c.hasVeto,
    }))
  )
}
