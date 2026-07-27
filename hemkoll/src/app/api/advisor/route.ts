import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

type Message = { role: 'user' | 'assistant'; content: string }

// elprisetjustnu.se — fully open, no key, no signup. Zone defaults to SE3
// (Stockholm/Mälardalen, the most populous zone) until the house profile
// has a real one; disclosed in the prompt so the advisor never states it
// as fact for a house that might be in SE1/SE2/SE4.
async function fetchElpris(zone: string): Promise<string | null> {
  try {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const res = await fetch(`https://www.elprisetjustnu.se/api/v1/prices/${y}/${m}-${d}_${zone}.json`)
    if (!res.ok) return null
    const hours: { SEK_per_kWh: number; time_start: string }[] = await res.json()
    if (!hours.length) return null
    const cheapest = hours.reduce((a, b) => (b.SEK_per_kWh < a.SEK_per_kWh ? b : a))
    const priciest = hours.reduce((a, b) => (b.SEK_per_kWh > a.SEK_per_kWh ? b : a))
    const avg = hours.reduce((s, h) => s + h.SEK_per_kWh, 0) / hours.length
    const hr = (t: string) => new Date(t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    return `ELPRIS IDAG (zon ${zone}, öre/kWh): snitt ${(avg * 100).toFixed(0)}, billigast ${(cheapest.SEK_per_kWh * 100).toFixed(0)} kl ${hr(cheapest.time_start)}, dyrast ${(priciest.SEK_per_kWh * 100).toFixed(0)} kl ${hr(priciest.time_start)}`
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message } = await request.json()
    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Meddelande saknas' }, { status: 400 })
    }

    const DEFAULT_ZONE = 'SE3' // Stockholm/Mälardalen — until the house profile stores a real zone

    const [{ data: profile }, { data: items }, { data: events }, { data: sessionRow }, elprisBlock] = await Promise.all([
      supabase.from('hemkoll_house_profile').select('*').eq('user_id', user.id).single(),
      supabase.from('hemkoll_house_items').select('name, category, purchase_date, warranty_until, location, notes').eq('user_id', user.id),
      supabase.from('hemkoll_events').select('title, event_date, cost, notes, item_id').eq('user_id', user.id).order('event_date', { ascending: false }).limit(30),
      supabase.from('hemkoll_advisor_sessions').select('messages').eq('user_id', user.id).single(),
      fetchElpris(DEFAULT_ZONE),
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

    const systemPrompt = `Du är en pragmatisk husrådgivare. Svara ENDAST utifrån datan nedan om frågan handlar om det här specifika huset — gissa inte på fakta om huset som inte finns i datan, säg då att informationen saknas och vad som behövs för ett bättre svar. Elpriset nedan är för en ANTAGEN elprisszon (${DEFAULT_ZONE}) tills huset har en riktig zon sparad — nämn det om du använder elprissiffror i svaret. Ge konkreta, prioriterade råd (vad är mest värt att göra först, ungefär varför), inte generiska floskler. Svara kort och konkret på svenska.

${houseBlock}

${itemsBlock}

${eventsBlock}

${elprisBlock ?? 'ELPRIS IDAG: kunde inte hämtas just nu.'}`

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI-nyckel saknas i miljön' }, { status: 500 })

    const history = ((sessionRow?.messages as Message[] | null) ?? [])
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          ...history.slice(-16).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: message }] },
        ],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
      }),
    })
    const geminiData = await geminiRes.json()
    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!geminiRes.ok || !reply) {
      console.error('Gemini advisor error:', geminiData.error ?? geminiRes.status)
      throw new Error('Inget svar från AI')
    }

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
