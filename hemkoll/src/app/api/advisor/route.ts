import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

type Message = { role: 'user' | 'assistant'; content: string }

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message } = await request.json()
    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Meddelande saknas' }, { status: 400 })
    }

    const [{ data: profile }, { data: items }, { data: events }, { data: sessionRow }] = await Promise.all([
      supabase.from('hemkoll_house_profile').select('*').eq('user_id', user.id).single(),
      supabase.from('hemkoll_house_items').select('name, category, purchase_date, warranty_until, location, notes').eq('user_id', user.id),
      supabase.from('hemkoll_events').select('title, event_date, cost, notes, item_id').eq('user_id', user.id).order('event_date', { ascending: false }).limit(30),
      supabase.from('hemkoll_advisor_sessions').select('messages').eq('user_id', user.id).single(),
    ])

    const houseBlock = profile
      ? `HUSPROFIL: adress=${profile.address ?? 'okänd'}, byggår=${profile.build_year ?? 'okänt'}, boyta=${profile.living_area_sqm ?? 'okänd'} m², uppvärmning=${profile.heating_type ?? 'okänd'}, energiklass=${profile.energy_class ?? 'okänd'}`
      : 'HUSPROFIL: ingen data sparad än (be användaren fylla i under Översikt eller importera en länk).'

    const itemsBlock = (items ?? []).length
      ? `OBJEKT I HUSET:\n${(items ?? []).map(i => `- ${i.name} (${i.category ?? 'okategoriserad'})${i.purchase_date ? `, inköpt ${i.purchase_date}` : ''}${i.notes ? `, ${i.notes}` : ''}`).join('\n')}`
      : 'OBJEKT I HUSET: inga loggade än.'

    const eventsBlock = (events ?? []).length
      ? `SENASTE HÄNDELSER:\n${(events ?? []).map(e => `- ${e.event_date}: ${e.title}${e.cost ? ` (${e.cost} kr)` : ''}`).join('\n')}`
      : 'SENASTE HÄNDELSER: inga loggade än.'

    const systemPrompt = `Du är en pragmatisk husrådgivare. Svara ENDAST utifrån datan nedan om frågan handlar om det här specifika huset — gissa inte på fakta om huset som inte finns i datan, säg då att informationen saknas och vad som behövs för ett bättre svar. Ge konkreta, prioriterade råd (vad är mest värt att göra först, ungefär varför), inte generiska floskler. Svara kort och konkret på svenska.

${houseBlock}

${itemsBlock}

${eventsBlock}`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI-nyckel saknas i miljön' }, { status: 500 })

    const history = ((sessionRow?.messages as Message[] | null) ?? [])
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        ...history.slice(-16).map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: message },
      ],
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    if (!reply) throw new Error('Inget svar från AI')

    const updatedMessages: Message[] = [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }]
    await supabase.from('hemkoll_advisor_sessions').upsert({
      user_id: user.id,
      messages: updatedMessages,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('Advisor error:', err)
    return NextResponse.json({ error: 'Kunde inte svara just nu' }, { status: 500 })
  }
}
