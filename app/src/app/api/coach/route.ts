import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { COACHES, getCoachById, CoachId, UserContext } from '@/lib/agents/coaches'
import { createSupabaseServerClient } from '@/lib/supabase'

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

    const history = (sessionData?.messages ?? []) as Array<{ role: string; content: string }>
    const systemPrompt = coach.systemPrompt(sport, userContext)
    const apiKey = profile?.llm_api_key_encrypted ?? process.env.ANTHROPIC_API_KEY!

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

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''

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
